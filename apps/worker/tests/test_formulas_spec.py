"""Спецификационные тесты — сверяют формулы движка с примерами из Veloseller_Dev_Spec.docx.

Каждый тест содержит ссылку на Rule из ТЗ и точный пример. Регрессия любого
коэффициента (40/25/0.2/0.3/1.0/7/180/95/40) сразу ломает соответствующий тест.

Это «живая документация» — формулы из ТЗ закодированы в тестах.
"""
from __future__ import annotations
from datetime import date

import pytest

from app.engine import alerts, coverage, velocity
from app.engine.confidence import calculate_confidence
from app.engine.health import (
    inventory_segment,
    is_underestimated_sku,
    sku_health_score,
)
from app.engine.lost_revenue import average_stockout_price, lost_revenue_per_sku
from app.engine.price import PriceChange, calculate_elasticity
from app.engine.safety_stock import calculate_recommendation, reorder_point, safety_stock
from app.engine.store import (
    SkuHealthInput,
    SkuValue,
    concentration_50,
    demand_pattern,
    demand_weight,
    frozen_inventory_value,
    warehouse_health_score,
)
from app.schemas import InventorySegment


# =============================================================================
# Rule 5 — Velocity (TVelo)
# =============================================================================

class TestRule5Velocity:
    """Rule 5.1-5.7 — confirmed/adjusted velocity по спеке."""

    def test_rule_5_1_confirmed_velocity_basic(self):
        """Rule 5.1: ConfirmedVelocity = ConfirmedConsumption / in_stock_days.

        Пример: 30 единиц продано за 10 in-stock дней → 3 ед/день.
        """
        consumption = velocity.confirmed_consumption([-10, -10, -10])
        assert consumption == 30
        assert velocity.confirmed_velocity(30, 10) == 3.0

    def test_rule_5_3_adjusted_velocity_continuity_correction(self):
        """Rule 5.3: AdjustedVelocity = (Consumption + Median30d × ExcludedInStockDays) / in_stock_days.

        Пример из ТЗ: при 1 anomaly_excluded дне с median=2.0, остальные 7 дней по 1 продаже:
        consumption=7, in_stock=8, median=2, excluded_in_stock=1
        → adjusted = (7 + 2×1) / 8 = 9/8 = 1.125
        """
        adj = velocity.adjusted_velocity(
            consumption=7, median_30d_vel=2.0, excluded_in_stock_days=1, in_stock_days=8
        )
        assert adj == pytest.approx(1.125)

    def test_rule_5_7_no_history_zero(self):
        """Rule 5.7: если нет clean sales_like history → Median30dVelocity = 0."""
        assert velocity.median_30d_velocity([]) == 0.0
        # И тогда adjusted_velocity = 0 если нет sales:
        assert velocity.adjusted_velocity(0, 0.0, 0, 10) == 0.0


# =============================================================================
# Rule 6 — Confidence Score
# =============================================================================

class TestRule6Confidence:
    """Rule 6.1-6.7 — confidence score по спеке."""

    def test_rule_6_1_initial_score_95(self):
        """Rule 6.1: initial confidence_score = 95.

        Чистый период (без repl/anom/missing) даёт ровно 95.
        """
        r = calculate_confidence(period_days=30, replenishment_days=0,
                                  anomaly_days=0, missing_data_days=0)
        assert r.initial == 95.0
        assert r.final == 95.0

    def test_rule_6_3_replenishment_penalty_doc_example(self):
        """Rule 6.3: «1 replenishment day in 7-day period = -14%».

        1/7 × 100 = 14.29% штрафа → final = 95 - 14.29 ≈ 80.71
        """
        r = calculate_confidence(period_days=7, replenishment_days=1,
                                  anomaly_days=0, missing_data_days=0)
        assert r.replenishment_like == pytest.approx(14.29, abs=0.01)
        assert r.final == pytest.approx(80.71, abs=0.01)

    def test_rule_6_6_floor_40(self):
        """Rule 6.6: минимальное значение confidence_score = 40.

        Даже если штрафы превышают 55, итог не падает ниже 40.
        """
        r = calculate_confidence(period_days=10, replenishment_days=10,
                                  anomaly_days=10, missing_data_days=10)
        # 95 - 100 - 100 - 100 = -205, но floor = 40
        assert r.final == 40.0

    def test_rule_6_7_breakdown_structure(self):
        """Rule 6.7: должен быть breakdown с replenishment/anomaly/missing процентами.

        Пример: period=30, repl=3, anom=1, miss=2:
        - repl: 10%
        - anom: 3.33%
        - missing: 6.67%
        - final: 95 - 20 = 75
        """
        r = calculate_confidence(period_days=30, replenishment_days=3,
                                  anomaly_days=1, missing_data_days=2)
        assert r.replenishment_like == pytest.approx(10.0, abs=0.01)
        assert r.anomaly_like == pytest.approx(3.33, abs=0.01)
        assert r.missing_data == pytest.approx(6.67, abs=0.01)
        assert r.final == 75.0


# =============================================================================
# Rule 7 — Coverage Days
# =============================================================================

class TestRule7Coverage:
    """Rule 7.1-7.2 — coverage_days."""

    def test_rule_7_1_basic_division(self):
        """Rule 7.1: coverage_days = current_stock / adjusted_velocity."""
        # 100 единиц / 5 в день = 20 дней
        assert coverage.coverage_days(100, 5.0) == 20.0

    def test_rule_7_2_null_when_velocity_zero(self):
        """Rule 7.2: если AdjustedVelocity = 0 → CoverageDays = null."""
        assert coverage.coverage_days(100, 0) is None
        assert coverage.coverage_days(0, 0) is None
        # Граничный: чуть выше нуля
        assert coverage.coverage_days(100, 0.001) == pytest.approx(100000)


# =============================================================================
# Rule 9 — Lost Revenue
# =============================================================================

class TestRule9LostRevenue:
    """Rule 9.1-9.2 — lost units и revenue."""

    def test_rule_9_1_lost_units(self):
        """Rule 9.1: LostUnits = AdjustedVelocity × StockoutDays."""
        # 3 ед/день × 5 stockout дней = 15
        assert coverage.lost_units(3.0, 5) == 15.0

    def test_rule_9_2_avg_with_prices_during_stockout(self):
        """Rule 9.2: AverageStockoutPrice = AVG(price during stockout period)."""
        # Цены 100, 200, 150 за 3 дня stockout → AVG = 150
        assert average_stockout_price([100.0, 200.0, 150.0], None) == 150.0

    def test_rule_9_2_fallback_latest_when_no_data(self):
        """Rule 9.2: если цены за stockout-период нет → latest known price."""
        assert average_stockout_price([], 120.0) == 120.0

    def test_rule_9_2_full_formula(self):
        """Rule 9.2: LostRevenue = LostUnits × AverageStockoutPrice.

        Пример: vel=2, stockout=5 дней, средняя цена за период = 150
        → lost = 2 × 5 × 150 = 1500
        """
        result = lost_revenue_per_sku(2.0, 5, [100.0, 200.0, 150.0], None)
        assert result == 1500.0


# =============================================================================
# Rule 10 — Alerts
# =============================================================================

class TestRule10Alerts:
    """Rule 10.1-10.5 — пороги алертов."""

    def test_rule_10_1_low_stock_threshold_7(self):
        """Rule 10.1: CoverageDays <= 7 → low_stock alert."""
        assert alerts.low_stock_alert(7.0) is True   # граница
        assert alerts.low_stock_alert(6.99) is True
        assert alerts.low_stock_alert(7.01) is False  # за границей

    def test_rule_10_2_critical_threshold_3(self):
        """Rule 10.2: CoverageDays <= 3 → critical_stock alert."""
        assert alerts.critical_stock_alert(3.0) is True   # граница
        assert alerts.critical_stock_alert(3.01) is False

    def test_rule_10_3_dead_threshold_180(self):
        """Rule 10.3: CoverageDays > 180 → dead_inventory alert."""
        assert alerts.dead_inventory_alert(180.0) is False  # граница НЕ срабатывает
        assert alerts.dead_inventory_alert(180.01) is True

    def test_rule_10_4_repeated_stockout_threshold_3(self):
        """Rule 10.4: StockoutDays > 3 за период."""
        assert alerts.repeated_stockout_alert(3) is False  # ровно 3 — НЕ алерт
        assert alerts.repeated_stockout_alert(4) is True

    def test_rule_10_5_no_alerts_when_coverage_null(self):
        """Rule 10.5: при coverage=null не срабатывать по low/critical/dead."""
        assert alerts.low_stock_alert(None) is False
        assert alerts.critical_stock_alert(None) is False
        assert alerts.dead_inventory_alert(None) is False


# =============================================================================
# Rule 12 — Price
# =============================================================================

class TestRule12Price:
    """Rule 12.3 — price elasticity."""

    def test_rule_12_3_minimum_7_days_each_side(self):
        """Rule 12.3: enough_data = >=7 in-stock days before AND >=7 after."""
        change = PriceChange(date(2026, 1, 15), 100.0, 110.0, 10.0)

        # 6 дней до — недостаточно
        assert calculate_elasticity(change, [10.0] * 6, [5.0] * 7) is None
        # 6 дней после — недостаточно
        assert calculate_elasticity(change, [10.0] * 7, [5.0] * 6) is None
        # Ровно 7 — достаточно
        assert calculate_elasticity(change, [10.0] * 7, [5.0] * 7) is not None

    def test_rule_12_3_impact_formula(self):
        """Rule 12.3: price_impact_percent = (vel_after - vel_before) / vel_before × 100.

        Пример: 10/день → 5/день после повышения цены = (5-10)/10*100 = -50%
        """
        change = PriceChange(date(2026, 1, 15), 100.0, 110.0, 10.0)
        sig = calculate_elasticity(change, [10.0] * 7, [5.0] * 7)
        assert sig is not None
        assert sig.price_impact_percent == -50.0
        assert sig.velocity_before == 10.0
        assert sig.velocity_after == 5.0


# =============================================================================
# Rule 13.1 — SKU Health Score
# =============================================================================

class TestRule13_1SkuHealth:
    """Rule 13.1 — главный пример из ТЗ + cap проверки."""

    def test_full_doc_example_score_85(self):
        """ТЗ полный пример: stockout=3, period=30, cov=5, conf=82 → 85.

        Step 1 — StockoutPenalty: 3/30×40 = 4
        Step 2 — LowCoveragePenalty: (7-5)/7×25 ≈ 7.14
        Step 3 — DeadInventoryPenalty: 0 (cov=5 не > 180)
        Step 4 — ConfidencePenalty: (100-82)×0.2 = 3.6
        Step 5 — Final: 100 - 4 - 7.14 - 3.6 ≈ 85.26 → round to 85
        """
        h = sku_health_score(stockout_days=3, period_days=30,
                              coverage_days_value=5.0, confidence_score=82.0)
        assert h.stockout == pytest.approx(4.0, abs=0.01)
        assert h.low_coverage == pytest.approx(7.14, abs=0.01)
        assert h.dead_inventory == 0.0
        assert h.confidence == pytest.approx(3.6, abs=0.01)
        assert h.final == 85

    def test_stockout_penalty_cap_40(self):
        """Stockout penalty имеет cap=40 (даже если stockout > period).

        ТЗ: «Max 40, потому что stockout — самая дорогая проблема»
        """
        # 30/30 даёт ровно 40
        h1 = sku_health_score(30, 30, None, 100.0)
        assert h1.stockout == 40.0
        # 100/30 → 133/3 = округлено до 40 (cap)
        h2 = sku_health_score(100, 30, None, 100.0)
        assert h2.stockout == 40.0

    def test_low_coverage_at_threshold_7_is_zero(self):
        """Rule 13.1: «Coverage = 7 → Penalty: 0»."""
        h = sku_health_score(0, 30, 7.0, 100.0)
        assert h.low_coverage == 0.0

    def test_low_coverage_at_zero_is_25(self):
        """Rule 13.1: «Coverage = 0 → Penalty: 25»."""
        h = sku_health_score(0, 30, 0.0, 100.0)
        assert h.low_coverage == 25.0

    def test_dead_inventory_at_threshold_180_is_zero(self):
        """Coverage=180 ровно — НЕ dead (граничное условие)."""
        h = sku_health_score(0, 30, 180.0, 100.0)
        assert h.dead_inventory == 0.0

    def test_dead_inventory_at_360_is_capped_25(self):
        """ТЗ: «Coverage = 360 → Penalty: 25»."""
        h = sku_health_score(0, 30, 360.0, 100.0)
        assert h.dead_inventory == 25.0

    def test_dead_inventory_cap_at_extreme_values(self):
        """Даже cov=10000 даёт ровно 25 (cap)."""
        h = sku_health_score(0, 30, 10000.0, 100.0)
        assert h.dead_inventory == 25.0

    def test_confidence_penalty_doc_example(self):
        """Rule 13.1: «Confidence = 80 → Penalty = (100-80)×0.2 = 4»."""
        h = sku_health_score(0, 30, 30.0, 80.0)
        assert h.confidence == 4.0

    def test_health_score_min_zero(self):
        """0 ≤ final ≤ 100 (ограничение из ТЗ)."""
        # Экстремальные штрафы — но не уйдём в минус
        h = sku_health_score(30, 30, 0.0, 0.0)
        # stockout=40, low_cov=25, dead=0, conf=20 → 100-85=15
        assert 0 <= h.final <= 100

    def test_health_score_max_100(self):
        """Идеальный SKU: 0 stockout, нормальная coverage, confidence=100 → 100."""
        h = sku_health_score(0, 30, 30.0, 100.0)
        assert h.final == 100


# =============================================================================
# Rule 13.2 — Warehouse Health Score (weighted)
# =============================================================================

class TestRule13_2WarehouseHealth:
    """Rule 13.2 — weighted SKU health минус weighted stockout penalty."""

    def test_equal_weights_simple_average(self):
        """SKU с одинаковыми весами → arithmetic mean of healths."""
        skus = [
            SkuHealthInput("a", health_score=80, stock_quantity=10, price=100.0,
                            adjusted_velocity=1.0, median_30d_velocity=1.0, is_out_of_stock=False),
            SkuHealthInput("b", health_score=60, stock_quantity=10, price=100.0,
                            adjusted_velocity=1.0, median_30d_velocity=1.0, is_out_of_stock=False),
        ]
        # Weighted avg = (80×1000 + 60×1000) / 2000 = 70
        # Нет OOS → stockout_pen = 0
        assert warehouse_health_score(skus) == 70

    def test_weighted_average_higher_value_dominates(self):
        """SKU с большей стоимостью имеет больше веса."""
        skus = [
            # Дешёвый SKU, health=20
            SkuHealthInput("a", 20, 1, 10.0, 1.0, 1.0, False),
            # Дорогой SKU, health=90
            SkuHealthInput("b", 90, 100, 1000.0, 1.0, 1.0, False),
        ]
        # weight_a = 1×10 = 10, weight_b = 100×1000 = 100000
        # weighted = (20×10 + 90×100000) / 100010 = 9000200/100010 ≈ 89.99
        # → ~90 (дорогой SKU доминирует)
        score = warehouse_health_score(skus)
        assert score is not None
        assert 89 <= score <= 90  # дорогой SKU задаёт результат

    def test_stockout_penalty_30(self):
        """Один OOS SKU → весь demand-share OOS → penalty = 1.0 × 30 = 30."""
        skus = [
            SkuHealthInput("a", 80, 10, 100.0, 1.0, 1.0, True),  # OOS
        ]
        # Weighted health = 80, stockout_share = 100%, penalty = 30
        # final = 80 - 30 = 50
        assert warehouse_health_score(skus) == 50

    def test_stockout_partial_demand_share(self):
        """OOS SKU занимает 50% demand → штраф = 0.5 × 30 = 15."""
        skus = [
            SkuHealthInput("a", 80, 10, 100.0, adjusted_velocity=2.0,
                            median_30d_velocity=2.0, is_out_of_stock=True),  # demand=200
            SkuHealthInput("b", 80, 10, 100.0, adjusted_velocity=2.0,
                            median_30d_velocity=2.0, is_out_of_stock=False),  # demand=200
        ]
        # Weighted health = 80, stockout_share = 200/400 = 0.5, penalty = 15
        # final = 80 - 15 = 65
        assert warehouse_health_score(skus) == 65

    def test_empty_returns_none(self):
        """Нет SKU → None (не показываем 0 чтобы UI отличал «пусто» от «критично»)."""
        assert warehouse_health_score([]) is None


# =============================================================================
# Rule 13.3 — Inventory Segmentation (граничные значения)
# =============================================================================

class TestRule13_3SegmentationBoundaries:
    """Rule 13.3 — граничные значения coverage для сегментов."""

    @pytest.mark.parametrize("cov,expected", [
        (None, InventorySegment.INSUFFICIENT_DATA),
        (0.0, InventorySegment.FAST_MOVERS),     # 0 < 14
        (13.99, InventorySegment.FAST_MOVERS),
        (14.0, InventorySegment.STABLE),         # >= 14 граница
        (30.0, InventorySegment.STABLE),
        (60.0, InventorySegment.STABLE),         # <= 60 граница
        (60.01, InventorySegment.SLOW_MOVERS),
        (180.0, InventorySegment.SLOW_MOVERS),   # <= 180 граница
        (180.01, InventorySegment.DEAD_INVENTORY_RISK),
        (1000.0, InventorySegment.DEAD_INVENTORY_RISK),
    ])
    def test_segment_boundaries(self, cov, expected):
        assert inventory_segment(cov) == expected


# =============================================================================
# Rule 13.4 — Underestimated SKU
# =============================================================================

class TestRule13_4Underestimated:
    """Rule 13.4 — все три условия должны выполниться одновременно."""

    def test_all_three_conditions_must_hold(self):
        """stockout>0 AND vel>median AND confidence>=70."""
        # Все 3 — True
        assert is_underestimated_sku(5, 10.0, 5.0, 80.0) is True
        # confidence ровно 70 — True (граница)
        assert is_underestimated_sku(5, 10.0, 5.0, 70.0) is True
        # confidence чуть ниже — False
        assert is_underestimated_sku(5, 10.0, 5.0, 69.99) is False

    def test_velocity_equal_to_median_is_not_underestimated(self):
        """vel = median → НЕ underestimated (строгое >)."""
        assert is_underestimated_sku(5, 5.0, 5.0, 80.0) is False

    def test_zero_stockout_disqualifies(self):
        """Если stockout=0 — товар не underestimated даже при высокой velocity."""
        assert is_underestimated_sku(0, 1000.0, 1.0, 100.0) is False


# =============================================================================
# Concentration & Demand Pattern
# =============================================================================

class TestConcentration:
    """Section 1.5 — inventory/demand concentration_50."""

    def test_one_sku_covers_exactly_50_pct(self):
        """50/30/20: top-1 даёт ровно 50% → concentration=1."""
        items = [SkuValue("a", 50), SkuValue("b", 30), SkuValue("c", 20)]
        assert concentration_50(items) == 1

    def test_pareto_80_20(self):
        """80/10/10: top-1 уже даёт 80% > 50% → concentration=1."""
        items = [SkuValue("a", 80), SkuValue("b", 10), SkuValue("c", 10)]
        assert concentration_50(items) == 1

    def test_uniform_distribution(self):
        """4 равных по 25%: нужно 2 чтобы покрыть 50% → concentration=2."""
        items = [SkuValue(str(i), 25) for i in range(4)]
        assert concentration_50(items) == 2

    def test_inventory_vs_demand_can_differ(self):
        """Inventory concentration ≠ demand concentration в общем случае."""
        # SKU A: дорогой склад, медленные продажи
        # SKU B: дешёвый склад, быстрые продажи
        inv_items = [SkuValue("A", 1000), SkuValue("B", 100)]  # 90% склада на A
        dem_items = [SkuValue("A", 1), SkuValue("B", 100)]     # 99% спроса на B

        assert concentration_50(inv_items) == 1   # A покрывает >50% склада
        assert concentration_50(dem_items) == 1   # B покрывает >50% спроса
        # Это разные SKU → разные стратегии для seller'а


class TestDemandPatternBoundaries:
    """Section 1.5 — demand_pattern по коэффициенту вариации."""

    def test_stable_below_03(self):
        """CV < 0.3 → stable. Малая дисперсия."""
        # std/mean = ~0.05 — точно stable
        assert demand_pattern([10.0] * 14) == "stable"
        # Чуть-чуть колеблется
        assert demand_pattern([10.0, 10.1, 10.0, 9.9, 10.0] * 3) == "stable"

    def test_unpredictable_above_10(self):
        """CV > 1.0 → unpredictable."""
        # Чередуем 0 и 100 — std=mean → cv=1.0; делаем хуже
        assert demand_pattern([0.0, 0.0, 0.0, 100.0] * 5) == "unpredictable"

    def test_insufficient_history_below_14_days(self):
        """Меньше 14 дней — insufficient_history."""
        assert demand_pattern([10.0] * 13) == "insufficient_history"
        assert demand_pattern([10.0] * 14) != "insufficient_history"

    def test_zero_mean_returns_insufficient(self):
        """Все нули → mean=0 → нельзя посчитать CV → insufficient."""
        assert demand_pattern([0.0] * 20) == "insufficient_history"


# =============================================================================
# Frozen Inventory Value
# =============================================================================

class TestFrozenInventory:
    """Section 1.5: sku_frozen = stock × price if coverage_days > 180."""

    def test_at_boundary_180_not_frozen(self):
        """cov=180 ровно — НЕ frozen (строгое >)."""
        skus = [SkuHealthInput("a", 80, 10, 100.0, 0, 0, False)]
        cov_map = {"a": 180.0}
        assert frozen_inventory_value(skus, cov_map) == 0.0

    def test_above_180_is_frozen(self):
        """cov=181 → frozen = 10 × 100 = 1000."""
        skus = [SkuHealthInput("a", 80, 10, 100.0, 0, 0, False)]
        cov_map = {"a": 181.0}
        assert frozen_inventory_value(skus, cov_map) == 1000.0

    def test_null_coverage_not_frozen(self):
        """cov=null (нет данных о velocity) — НЕ frozen."""
        skus = [SkuHealthInput("a", 80, 10, 100.0, 0, 0, False)]
        cov_map = {"a": None}
        assert frozen_inventory_value(skus, cov_map) == 0.0

    def test_sum_across_multiple_frozen_skus(self):
        """Сумма по всем frozen SKU."""
        skus = [
            SkuHealthInput("a", 80, 10, 100.0, 0, 0, False),   # frozen 1000
            SkuHealthInput("b", 80, 5, 200.0, 0, 0, False),    # frozen 1000
            SkuHealthInput("c", 80, 100, 50.0, 0, 0, False),   # НЕ frozen
        ]
        cov_map = {"a": 200.0, "b": 250.0, "c": 30.0}
        assert frozen_inventory_value(skus, cov_map) == 2000.0


# =============================================================================
# Demand Weight (Rule 13.2 helper + concentration_50 helper)
# =============================================================================

class TestDemandWeight:
    """demand_weight: cascade adjusted → median → 1."""

    def test_use_adjusted_when_positive(self):
        """Приоритет 1: adjusted_velocity > 0 → adj × price."""
        assert demand_weight(adjusted_velocity=2.0, median_30d_velocity=5.0, price=10.0) == 20.0

    def test_fallback_to_median_when_adjusted_zero(self):
        """Приоритет 2: если adj=0 но median>0 → median × price."""
        assert demand_weight(0.0, 5.0, 10.0) == 50.0

    def test_fallback_to_one_when_no_velocity(self):
        """Приоритет 3: всё ноль → 1 (sentinel value)."""
        assert demand_weight(0.0, 0.0, 100.0) == 1.0

    def test_negative_velocity_not_used(self):
        """Защита: отрицательная velocity (теоретически невозможна) → fallback."""
        assert demand_weight(-1.0, 5.0, 10.0) == 50.0  # fallback к median
