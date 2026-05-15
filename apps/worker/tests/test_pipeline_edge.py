"""Edge cases для pipeline.compute_metrics_for_sku.

Раньше было только 2 smoke теста (sales-only, sales+stockout) + e2e.
Добавляем сложные сценарии:
  - Период из одних аномалий (ни одного подтверждённого sale)
  - Период из одних missing_data
  - Replenishment в середине sales-периода
  - Continuity correction без excluded_in_stock
  - Continuity correction с большим числом excluded
"""
from __future__ import annotations
from datetime import date
from uuid import uuid4

import pytest

from app.engine.pipeline import DailyAggregate, compute_metrics_for_sku
from app.schemas import EventType, InventorySegment


def _agg(day: date, *, stock: int, event: EventType, delta: int | None,
         availability: bool = True, excluded: bool = False, price: float = 10.0) -> DailyAggregate:
    return DailyAggregate(
        day=day, availability=availability, end_of_day_stock=stock, price=price,
        event_type=event, delta_stock=delta, excluded_from_confirmed_metrics=excluded,
    )


class TestPipelineEdgeCases:

    def test_all_anomaly_period_zero_confirmed_velocity(self):
        """7 дней все ANOMALY_LIKE → ничего не подтверждено, confidence низкий."""
        ps, pe = date(2026, 1, 1), date(2026, 1, 7)
        aggs = [
            _agg(date(2026, 1, 1 + i), stock=100 - i * 10,
                 event=EventType.ANOMALY_LIKE, delta=-10, excluded=True)
            for i in range(7)
        ]
        m = compute_metrics_for_sku(str(uuid4()), ps, pe, aggs, current_stock=30)
        # Ни одного sales_like → confirmed_velocity = 0
        assert m.confirmed_velocity == 0.0
        # Все 7 дней в аномалиях — confidence просёдает до floor=40
        assert m.confidence_score == 40.0
        assert m.in_stock_days == 7
        assert m.stockout_days == 0

    def test_all_missing_data_period(self):
        """7 дней все MISSING_DATA → нет in-stock, нет продаж, confidence в полу."""
        ps, pe = date(2026, 1, 1), date(2026, 1, 7)
        aggs = [
            _agg(date(2026, 1, 1 + i), stock=0,
                 event=EventType.MISSING_DATA, delta=None,
                 availability=False, excluded=True)
            for i in range(7)
        ]
        m = compute_metrics_for_sku(str(uuid4()), ps, pe, aggs, current_stock=0)
        assert m.confirmed_velocity == 0.0
        assert m.adjusted_velocity == 0.0
        assert m.in_stock_days == 0
        assert m.stockout_days == 7
        # 7 дней missing → штраф 100% → floor 40
        assert m.confidence_score == 40.0
        assert m.coverage_days == 0.0  # stock=0

    def test_replenishment_in_middle_excluded_from_confirmed(self):
        """5 sales + 1 replenishment + 5 sales → replenishment day excluded."""
        ps, pe = date(2026, 1, 1), date(2026, 1, 11)
        aggs = []
        # 5 дней продаж
        for i in range(5):
            aggs.append(_agg(date(2026, 1, 1 + i), stock=100 - i * 2,
                             event=EventType.SALES_LIKE, delta=-2))
        # 1 день пополнения (+50)
        aggs.append(_agg(date(2026, 1, 6), stock=140,
                         event=EventType.REPLENISHMENT_LIKE, delta=+50, excluded=True))
        # 5 дней продаж
        for i in range(5):
            aggs.append(_agg(date(2026, 1, 7 + i), stock=140 - (i + 1) * 2,
                             event=EventType.SALES_LIKE, delta=-2))
        m = compute_metrics_for_sku(str(uuid4()), ps, pe, aggs, current_stock=130)
        # consumption = 10 sales × 2 = 20
        # in_stock_days = 11, confirmed = 20/11 ≈ 1.818
        assert m.confirmed_velocity == pytest.approx(1.818, abs=0.01)
        # 11 дней все in-stock
        assert m.in_stock_days == 11
        # 1 день repl → штраф 1/11 ≈ 9% → confidence ≈ 86%
        assert 80 < m.confidence_score < 90

    def test_continuity_correction_with_no_excluded_in_stock(self):
        """Все sales — без excluded. adjusted == confirmed."""
        ps, pe = date(2026, 1, 1), date(2026, 1, 10)
        aggs = [
            _agg(date(2026, 1, 1 + i), stock=100 - i * 2,
                 event=EventType.SALES_LIKE, delta=-2)
            for i in range(10)
        ]
        m = compute_metrics_for_sku(str(uuid4()), ps, pe, aggs, current_stock=80)
        # consumption = 20, in_stock = 10 → confirmed = 2.0
        # excluded_in_stock = 0 → adjusted = (20 + median*0)/10 = 2.0
        assert m.confirmed_velocity == pytest.approx(2.0)
        assert m.adjusted_velocity == pytest.approx(2.0)

    def test_continuity_correction_with_many_excluded(self):
        """3 sales + 7 anomaly_excluded (все in-stock) → adjusted > confirmed (continuity boost)."""
        ps, pe = date(2026, 1, 1), date(2026, 1, 10)
        aggs = []
        for i in range(3):
            aggs.append(_agg(date(2026, 1, 1 + i), stock=100 - i * 3,
                             event=EventType.SALES_LIKE, delta=-3))
        # 7 дней аномалий — in-stock, но excluded
        stock_after = 100 - 3 * 3
        for i in range(7):
            stock_after -= 5
            aggs.append(_agg(date(2026, 1, 4 + i), stock=stock_after,
                             event=EventType.ANOMALY_LIKE, delta=-5, excluded=True))
        m = compute_metrics_for_sku(str(uuid4()), ps, pe, aggs, current_stock=stock_after)
        # consumption = 9, in_stock = 10, confirmed = 0.9
        # excluded_in_stock = 7, median из abs sales-дельт = 3 → adj = (9 + 3*7)/10 = 3.0
        assert m.confirmed_velocity == pytest.approx(0.9, abs=0.01)
        assert m.adjusted_velocity == pytest.approx(3.0, abs=0.01)
        # adjusted > confirmed — система вытянула велосити из-за аномальных дней
        assert m.adjusted_velocity > m.confirmed_velocity

    def test_zero_period_zero_metrics(self):
        """Пустой список aggregates — всё нули, но без исключений."""
        ps, pe = date(2026, 1, 1), date(2026, 1, 1)
        m = compute_metrics_for_sku(str(uuid4()), ps, pe, [], current_stock=0)
        assert m.confirmed_velocity == 0.0
        assert m.adjusted_velocity == 0.0
        assert m.in_stock_days == 0
        assert m.stockout_days == 0

    def test_underestimated_sku_detection_in_pipeline(self):
        """Сценарий: быстрые продажи и OOS → underestimated_sku flag.

        Note: pipeline.compute_metrics_for_sku сам не выставляет underestimated_sku
        — это делается в jobs/recalc по выходу metric. Но в metric должны быть
        все ингредиенты: stockout_days > 0, velocity > 5, confidence высокий.
        """
        ps, pe = date(2026, 1, 1), date(2026, 1, 10)
        aggs = []
        # 7 дней быстрых продаж (по 8/день)
        for i in range(7):
            aggs.append(_agg(date(2026, 1, 1 + i), stock=100 - i * 8,
                             event=EventType.SALES_LIKE, delta=-8))
        # 3 дня stockout
        for i in range(3):
            aggs.append(_agg(date(2026, 1, 8 + i), stock=0,
                             event=EventType.MISSING_DATA, delta=None,
                             availability=False, excluded=True))
        m = compute_metrics_for_sku(str(uuid4()), ps, pe, aggs, current_stock=0)
        # confirmed = 56/7 = 8.0
        assert m.confirmed_velocity == pytest.approx(8.0)
        assert m.stockout_days == 3
        # Confidence: period=10, missing=3 → 95 - 30 = 65, выше 70 не нужно для underestimated
        # Но is_underestimated_sku требует confidence ≥ 70 — здесь будет 65, не underestimated
        assert m.confidence_score == 65.0
