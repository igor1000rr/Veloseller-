"""Регрессия паритета формул get_skus_period_metrics (SQL RPC) ↔ движок воркера.

КОНТЕКСТ (аудит C3.2). SKU-лист за произвольный период считает метрики НА ЛЕТУ через
RPC public.get_skus_period_metrics (SQL), а ночной воркер пишет канонические метрики в
tvelo_metrics движком app/engine. Вопрос аудита: не разъехались ли эти два пути?

Что проверено на ПРОДЕ (1883 SKU, см. supabase/tests/get_skus_period_metrics_parity.sql):
  - in_stock_days и stockout_days RPC ↔ tvelo_metrics совпадают 1:1 (0 расхождений) —
    детерминированный счёт дней в полном паритете;
  - velocity совпадает у ~98.4%; остаток (~1.6%) расходится на 1-3 ед. потребления,
    т.к. confirmed-consumption воркера идёт через классификацию событий (recount/anomaly),
    а RPC берёт сырой SUM(ABS(delta_stock)) по sales_like. Это осознанный trade-off
    скорости on-the-fly расчёта, НЕ баг формулы (делят на один и тот же in_stock_days).

Этот тест фиксирует АЛГЕБРАИЧЕСКИЙ контракт: при одинаковых входах примитивы app/engine
дают ровно то же, что считает SELECT RPC. Если кто-то поменяет формулу с любой стороны
(напр. делить на total_days вместо in_stock_days, или другую coverage), тест упадёт.
SQL RPC в CI не выполнить (нет тестовой БД) — поэтому ниже держим ТОЧНУЮ транскрипцию
CASE-выражений RPC, а паритет на реальных данных сверяет упомянутый .sql-чек.

ПРИ ПРАВКЕ SQL get_skus_period_metrics: синхронизируй _rpc_* ниже и убедись, что движок
(confirmed_velocity / coverage_days / lost_revenue_per_sku) по-прежнему совпадает.
"""
from __future__ import annotations
from typing import Optional

import pytest

from app.engine.velocity import confirmed_velocity
from app.engine.coverage import coverage_days
from app.engine.lost_revenue import lost_revenue_per_sku


# --- Точная транскрипция формул SELECT в get_skus_period_metrics (confirmed-базис) ---
def _rpc_velocity(sales_units: int, in_stock_days: int) -> float:
    # CASE WHEN in_stock_d > 0 THEN sales_u::numeric / in_stock_d ELSE 0
    return sales_units / in_stock_days if in_stock_days > 0 else 0.0


def _rpc_coverage(current_stock: int, sales_units: int, in_stock_days: int) -> Optional[float]:
    # CASE WHEN in_stock_d > 0 AND sales_u > 0 THEN cur_stock / (sales_u/in_stock_d) ELSE NULL
    if in_stock_days > 0 and sales_units > 0:
        return current_stock / (sales_units / in_stock_days)
    return None


def _rpc_lost_revenue(sales_units: int, in_stock_days: int, stockout_days: int, current_price: float) -> float:
    # CASE WHEN in_stock_d > 0 AND sales_u > 0 THEN (sales_u/in_stock_d) * stockout_d * cur_price ELSE 0
    if in_stock_days > 0 and sales_units > 0:
        return (sales_units / in_stock_days) * stockout_days * (current_price or 0.0)
    return 0.0


# (sales_units, in_stock_days, stockout_days, current_stock, current_price)
CASES = [
    (30, 30, 0, 100, 500.0),   # всегда в наличии
    (15, 20, 10, 40, 250.0),   # частичный stockout
    (0, 30, 0, 100, 500.0),    # нет продаж → velocity 0, coverage NULL, lost 0
    (10, 0, 30, 0, 100.0),     # ни дня в наличии → защита деления, velocity 0
    (5, 7, 23, 0, 300.0),      # короткое окно, остаток 0
    (100, 25, 5, 250, 0.0),    # цена 0 → lost 0
    (8, 10, 4, 60, 150.0),
    (1, 1, 0, 3, 999.0),       # вырожденный 1-дневный
]


class TestPeriodMetricsFormulaParity:
    @pytest.mark.parametrize("sales,isd,sod,stock,price", CASES)
    def test_velocity_equals_confirmed_velocity(self, sales, isd, sod, stock, price):
        assert confirmed_velocity(sales, isd) == pytest.approx(_rpc_velocity(sales, isd))

    @pytest.mark.parametrize("sales,isd,sod,stock,price", CASES)
    def test_coverage_matches_rpc(self, sales, isd, sod, stock, price):
        worker = coverage_days(stock, confirmed_velocity(sales, isd))
        rpc = _rpc_coverage(stock, sales, isd)
        if rpc is None:
            assert worker is None
        else:
            assert worker == pytest.approx(rpc)

    @pytest.mark.parametrize("sales,isd,sod,stock,price", CASES)
    def test_lost_revenue_matches_rpc(self, sales, isd, sod, stock, price):
        # single latest-known price → average_stockout_price == current_price RPC
        worker = lost_revenue_per_sku(confirmed_velocity(sales, isd), sod, [], price)
        assert worker == pytest.approx(_rpc_lost_revenue(sales, isd, sod, price))

    def test_velocity_zero_when_no_in_stock_days(self):
        # деление защищено с обеих сторон — частая точка регрессии
        assert confirmed_velocity(10, 0) == 0.0
        assert _rpc_velocity(10, 0) == 0.0

    def test_coverage_null_when_velocity_zero(self):
        assert coverage_days(50, confirmed_velocity(0, 30)) is None
        assert _rpc_coverage(50, 0, 30) is None
