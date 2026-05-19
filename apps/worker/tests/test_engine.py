"""Полный набор тестов для engine. Все правила спеки."""
from __future__ import annotations

from datetime import date

import pytest

from app.engine import alerts, coverage, velocity
from app.engine.confidence import calculate_confidence
from app.engine.events import classify_event
from app.engine.health import (
    inventory_segment,
    is_underestimated_sku,
    sku_health_score,
)
from app.engine.pipeline import DailyAggregate, compute_metrics_for_sku
from app.engine.store import (
    SkuHealthInput,
    SkuValue,
    concentration_50,
    demand_pattern,
    demand_weight,
    frozen_inventory_value,
    health_label,
    total_inventory_value,
    warehouse_health_score,
)
from app.schemas import EventType, InventorySegment


# ============================================================================
# events.py — Rules 1.3, 2.2, 3.1-3.6
# ============================================================================

class TestClassifyEvent:
    def test_first_snapshot(self):
        et, ex = classify_event(None, None, previous_exists=False)
        assert et == EventType.FIRST_SNAPSHOT and ex is True

    def test_missing_flag(self):
        et, ex = classify_event(10, 2.0, True, is_missing=True)
        assert et == EventType.MISSING_DATA and ex is True

    def test_missing_no_delta(self):
        et, ex = classify_event(None, 2.0, True)
        assert et == EventType.MISSING_DATA and ex is True

    def test_no_change(self):
        et, ex = classify_event(0, 2.0, True)
        assert et == EventType.NO_CHANGE and ex is False

    def test_sales_like(self):
        et, ex = classify_event(-3, 2.0, True)
        assert et == EventType.SALES_LIKE and ex is False

    def test_sales_like_at_threshold(self):
        et, _ = classify_event(-10, 2.0, True)
        assert et == EventType.SALES_LIKE

    def test_replenishment(self):
        et, ex = classify_event(15, 2.0, True)
        assert et == EventType.REPLENISHMENT_LIKE and ex is True

    def test_anomaly(self):
        et, ex = classify_event(-11, 2.0, True)
        assert et == EventType.ANOMALY_LIKE and ex is True

    def test_no_history_no_anomaly(self):
        et, _ = classify_event(-100, None, True)
        assert et == EventType.SALES_LIKE

    def test_zero_median_no_anomaly(self):
        et, _ = classify_event(-5, 0.0, True)
        assert et == EventType.SALES_LIKE


# ============================================================================
# velocity.py — Rules 5.1-5.7
# ============================================================================

class TestVelocity:
    def test_confirmed_consumption(self):
        assert velocity.confirmed_consumption([-3, -2, -5]) == 10

    def test_confirmed_velocity(self):
        assert velocity.confirmed_velocity(10, 5) == 2.0

    def test_confirmed_velocity_zero_days(self):
        assert velocity.confirmed_velocity(10, 0) == 0.0

    def test_median_30d(self):
        assert velocity.median_30d_velocity([1, 2, 3, 4, 5]) == 3.0

    def test_median_30d_empty(self):
        assert velocity.median_30d_velocity([]) == 0.0

    def test_adjusted_no_excluded(self):
        assert velocity.adjusted_velocity(10, 2.0, 0, 5) == 2.0

    def test_adjusted_with_continuity(self):
        # (10 + 2.0*3) / 5 = 16/5 = 3.2
        assert velocity.adjusted_velocity(10, 2.0, 3, 5) == pytest.approx(3.2)

    def test_adjusted_zero_in_stock(self):
        assert velocity.adjusted_velocity(10, 2.0, 3, 0) == 0.0


# ============================================================================
# confidence.py — Rules 6.1-6.7
# ============================================================================

class TestConfidence:
    def test_clean_period(self):
        # sales_like_days не передан (legacy) → low_pen=0
        r = calculate_confidence(7, 0, 0, 0)
        assert r.initial == 95.0 and r.final == 95.0

    def test_replenishment_penalty(self):
        r = calculate_confidence(7, 1, 0, 0)
        assert r.replenishment_like == pytest.approx(14.29, abs=0.01)
        assert r.final == pytest.approx(80.71, abs=0.01)

    def test_all_penalties(self):
        r = calculate_confidence(10, 1, 1, 1)
        assert r.final == pytest.approx(65.0)

    def test_floor(self):
        r = calculate_confidence(10, 10, 10, 10)
        assert r.final == 40.0

    def test_zero_period(self):
        r = calculate_confidence(0, 0, 0, 0)
        assert r.final == 95.0

    def test_doc_example(self):
        # period=100, repl=10, anom=5, missing=3 -> 95-10-5-3=77
        r = calculate_confidence(100, 10, 5, 3)
        assert r.final == 77.0

    def test_low_history_penalty_applied(self):
        """БАГ 4: при sales_like_days < 7 confidence штрафуется."""
        # 0 sales_like → max штраф 35
        r = calculate_confidence(30, 0, 0, 0, sales_like_days=0)
        assert r.low_history == 35.0
        assert r.final == 60.0

    def test_low_history_partial(self):
        """3 sales_like дней → штраф ≈ 20."""
        r = calculate_confidence(30, 0, 0, 0, sales_like_days=3)
        # 35 * (1 - 3/7) = 35 * 4/7 = 20
        assert r.low_history == pytest.approx(20.0, abs=0.1)
        assert r.final == pytest.approx(75.0, abs=0.1)

    def test_low_history_threshold_no_penalty(self):
        """≥ 7 sales_like дней → нет штрафа."""
        r = calculate_confidence(30, 0, 0, 0, sales_like_days=7)
        assert r.low_history == 0.0
        assert r.final == 95.0

    def test_legacy_call_no_sales_like_no_penalty(self):
        """Без sales_like_days (legacy) штраф не применяется (бэк-совместимость)."""
        r = calculate_confidence(30, 0, 0, 0)  # default sales_like_days=-1
        assert r.low_history == 0.0
        assert r.final == 95.0


# ============================================================================
# coverage.py — Rules 4.3, 4.4, 7.1, 7.2, 8.1, 9.1, 9.2
# ============================================================================

class TestCoverage:
    def test_coverage_basic(self):
        assert coverage.coverage_days(100, 5.0) == 20.0

    def test_coverage_zero_velocity(self):
        assert coverage.coverage_days(100, 0) is None

    def test_coverage_negative_velocity(self):
        assert coverage.coverage_days(100, -1.0) is None

    def test_reorder(self):
        assert coverage.reorder_quantity(2.5, 30) == 75.0

    def test_stockout_count(self):
        assert coverage.count_stockout_days([True, False, True, False, False]) == 3

    def test_in_stock_count(self):
        assert coverage.count_in_stock_days([True, False, True, False, False]) == 2

    def test_lost_units(self):
        assert coverage.lost_units(2.0, 5) == 10.0

    def test_lost_revenue(self):
        assert coverage.lost_revenue(2.0, 5, 100.0) == 1000.0


# ============================================================================
# health.py — Rules 13.1, 13.3, 13.4
# ============================================================================

class TestHealth:
    def test_perfect(self):
        h = sku_health_score(0, 30, 30.0, 100.0)
        assert h.final == 100

    def test_doc_example(self):
        h = sku_health_score(3, 30, 5.0, 82.0)
        assert h.stockout == pytest.approx(4.0, abs=0.01)
        assert h.low_coverage == pytest.approx(7.14, abs=0.01)
        assert h.confidence == pytest.approx(3.6, abs=0.01)
        assert h.final == 85

    def test_stockout_capped(self):
        h = sku_health_score(30, 30, None, 100.0)
        assert h.stockout == 40.0

    def test_dead_inventory_capped(self):
        h = sku_health_score(0, 30, 10000.0, 100.0)
        assert h.dead_inventory == 25.0

    def test_no_coverage_no_penalty(self):
        h = sku_health_score(0, 30, None, 100.0)
        assert h.low_coverage == 0.0 and h.dead_inventory == 0.0

    def test_floor_zero(self):
        h = sku_health_score(30, 30, 0.0, 40.0)
        assert h.final == 23

    def test_extreme_penalties_to_floor(self):
        h = sku_health_score(30, 30, 1000.0, 0.0)
        assert 0 <= h.final <= 100


class TestSegment:
    def test_fast(self):
        assert inventory_segment(10.0) == InventorySegment.FAST_MOVERS

    def test_stable(self):
        assert inventory_segment(30.0) == InventorySegment.STABLE
        assert inventory_segment(14.0) == InventorySegment.STABLE
        assert inventory_segment(60.0) == InventorySegment.STABLE

    def test_slow(self):
        assert inventory_segment(120.0) == InventorySegment.SLOW_MOVERS

    def test_dead(self):
        assert inventory_segment(200.0) == InventorySegment.DEAD_INVENTORY_RISK

    def test_insufficient(self):
        assert inventory_segment(None) == InventorySegment.INSUFFICIENT_DATA


class TestUnderestimated:
    def test_true(self):
        assert is_underestimated_sku(5, 10.0, 5.0, 80.0) is True

    def test_no_stockout(self):
        assert is_underestimated_sku(0, 10.0, 5.0, 80.0) is False

    def test_low_velocity(self):
        assert is_underestimated_sku(5, 4.0, 5.0, 80.0) is False

    def test_low_confidence(self):
        assert is_underestimated_sku(5, 10.0, 5.0, 50.0) is False


# ============================================================================
# store.py — раздел 1.5, Rule 13.2
# ============================================================================

class TestStore:
    def test_concentration_50_basic(self):
        items = [SkuValue("a", 50), SkuValue("b", 30), SkuValue("c", 20)]
        assert concentration_50(items) == 1

    def test_concentration_50_even(self):
        items = [SkuValue(str(i), 25) for i in range(4)]
        assert concentration_50(items) == 2

    def test_concentration_50_empty(self):
        assert concentration_50([]) == 0

    def test_demand_weight_adj(self):
        assert demand_weight(2.0, 5.0, 10.0) == 20.0

    def test_demand_weight_fallback_median(self):
        assert demand_weight(0.0, 5.0, 10.0) == 50.0

    def test_demand_weight_fallback_one(self):
        assert demand_weight(0.0, 0.0, 10.0) == 1.0

    def test_demand_pattern_stable(self):
        assert demand_pattern([10.0] * 20) == "stable"

    def test_demand_pattern_insufficient(self):
        assert demand_pattern([10.0] * 5) == "insufficient_history"

    def test_demand_pattern_unpredictable(self):
        assert demand_pattern([0.0, 0.0, 0.0, 100.0] * 5) == "unpredictable"

    def test_warehouse_basic(self):
        skus = [
            SkuHealthInput("a", 80, 10, 100.0, 1.0, 1.0, False),
        ]
        assert warehouse_health_score(skus) == 80

    def test_warehouse_oos_penalty(self):
        skus = [
            SkuHealthInput("a", 80, 10, 100.0, 1.0, 1.0, True),
        ]
        assert warehouse_health_score(skus) == 50

    def test_warehouse_empty(self):
        assert warehouse_health_score([]) is None

    @pytest.mark.parametrize("score,label", [
        (95, "excellent"),
        (80, "good"),
        (65, "warning"),
        (45, "risky"),
        (20, "critical"),
    ])
    def test_health_label(self, score, label):
        assert health_label(score) == label

    def test_total_inventory_value(self):
        skus = [
            SkuHealthInput("a", 80, 10, 100.0, 0, 0, False),
            SkuHealthInput("b", 70, 5, 200.0, 0, 0, False),
        ]
        assert total_inventory_value(skus) == 10 * 100 + 5 * 200

    def test_frozen_inventory(self):
        skus = [
            SkuHealthInput("a", 80, 10, 100.0, 0, 0, False),
            SkuHealthInput("b", 70, 5, 200.0, 0, 0, False),
        ]
        cov = {"a": 30.0, "b": 250.0}
        assert frozen_inventory_value(skus, cov) == 1000.0


# ============================================================================
# alerts.py — Rules 10.1-10.5
# ============================================================================

class TestAlerts:
    def test_low_stock(self):
        assert alerts.low_stock_alert(5.0) is True
        assert alerts.low_stock_alert(8.0) is False
        assert alerts.low_stock_alert(None) is False

    def test_critical(self):
        assert alerts.critical_stock_alert(2.0) is True
        assert alerts.critical_stock_alert(5.0) is False
        assert alerts.critical_stock_alert(None) is False

    def test_dead(self):
        assert alerts.dead_inventory_alert(200.0) is True
        assert alerts.dead_inventory_alert(100.0) is False
        assert alerts.dead_inventory_alert(None) is False

    def test_repeated_stockout(self):
        assert alerts.repeated_stockout_alert(5) is True
        assert alerts.repeated_stockout_alert(3) is False


# ============================================================================
# pipeline.py — интеграционные сценарии
# ============================================================================

class TestPipeline:
    def test_smoke_30_days_constant_sales(self):
        """30 дней по 1 продаже/день, остаток 100. velocity=1, cov=100."""
        from uuid import uuid4
        pid = str(uuid4())
        ps = date(2026, 1, 1)
        pe = date(2026, 1, 30)
        agg = []
        for i in range(30):
            day = date(2026, 1, 1 + i)
            agg.append(DailyAggregate(
                day=day,
                availability=True,
                end_of_day_stock=100 - i,
                price=10.0,
                event_type=EventType.SALES_LIKE if i > 0 else EventType.FIRST_SNAPSHOT,
                delta_stock=-1 if i > 0 else None,
                excluded_from_confirmed_metrics=(i == 0),
            ))
        m = compute_metrics_for_sku(pid, ps, pe, agg, current_stock=70)
        assert m.in_stock_days == 30
        assert m.stockout_days == 0
        assert m.confirmed_velocity == pytest.approx(0.9667, abs=0.001)
        assert m.adjusted_velocity == pytest.approx(1.0, abs=0.01)
        assert m.coverage_days == pytest.approx(70.0, abs=1.0)
        assert m.segment == InventorySegment.SLOW_MOVERS or m.segment == InventorySegment.STABLE

    def test_smoke_with_real_stockout(self):
        """5 дней продаж + 5 дней реальный stockout (snapshot есть, stock=0).

        ВАЖНО: после БАГ 1 фикса MISSING_DATA НЕ считается как stockout. Поэтому
        в этом тесте моделируем РЕАЛЬНЫЙ stockout: snapshot существует с stock=0,
        availability=False, event_type=NO_CHANGE (или FIRST_SNAPSHOT для первого).
        """
        from uuid import uuid4
        pid = str(uuid4())
        ps = date(2026, 1, 1)
        pe = date(2026, 1, 10)
        agg = []
        for i in range(10):
            day = date(2026, 1, 1 + i)
            in_stock = i < 5
            if i == 0:
                event = EventType.FIRST_SNAPSHOT
                delta = None
                excluded = True
            elif 0 < i < 5:
                event = EventType.SALES_LIKE
                delta = -2
                excluded = False
            elif i == 5:
                # Переход с stock=2 на stock=0 — это последняя продажа (sales_like)
                event = EventType.SALES_LIKE
                delta = -2
                excluded = False
            else:
                # stock уже 0, остаётся 0 → NO_CHANGE с availability=False
                event = EventType.NO_CHANGE
                delta = 0
                excluded = False
            agg.append(DailyAggregate(
                day=day,
                availability=in_stock,
                end_of_day_stock=10 - i * 2 if in_stock else 0,
                price=100.0,
                event_type=event,
                delta_stock=delta,
                excluded_from_confirmed_metrics=excluded,
            ))
        m = compute_metrics_for_sku(pid, ps, pe, agg, current_stock=0)
        assert m.in_stock_days == 5
        assert m.stockout_days == 5  # реальный stockout НЕ через MISSING_DATA
        assert m.coverage_days == 0.0
        assert m.segment == InventorySegment.FAST_MOVERS


# ============================================================================
# store_aggregates.py — Store-level агрегаты
# ============================================================================

from app.engine.store_aggregates import SkuMetricRow, aggregate_store_metrics


class TestStoreAggregates:
    def _make(self, **kwargs) -> SkuMetricRow:
        defaults = dict(
            product_id="x", stock_quantity=10, price=100.0,
            adjusted_velocity=1.0, median_30d_velocity=1.0,
            coverage_days=10.0, stockout_days=0, confidence_score=90.0,
            segment=InventorySegment.STABLE, sku_health_score=80.0,
            availability=True,
        )
        defaults.update(kwargs)
        return SkuMetricRow(**defaults)

    def test_empty(self):
        agg = aggregate_store_metrics([])
        assert agg.total_sku_count == 0
        assert agg.warehouse_health_score is None

    def test_basic_counts(self):
        skus = [
            self._make(product_id="a", availability=True, coverage_days=30.0),
            self._make(product_id="b", availability=False, coverage_days=0.0),
            self._make(product_id="c", availability=True, coverage_days=5.0),
            self._make(product_id="d", availability=True, coverage_days=200.0),
        ]
        agg = aggregate_store_metrics(skus)
        assert agg.total_sku_count == 4
        assert agg.oos_sku_count == 1
        assert agg.low_stock_sku_count == 2
        assert agg.dead_inventory_sku_count == 1

    def test_inventory_value(self):
        skus = [
            self._make(stock_quantity=10, price=100.0),
            self._make(stock_quantity=5, price=200.0),
        ]
        agg = aggregate_store_metrics(skus)
        assert agg.total_inventory_value == 2000.0

    def test_lost_revenue(self):
        skus = [
            self._make(adjusted_velocity=2.0, stockout_days=5, price=100.0),
            self._make(adjusted_velocity=0.0, stockout_days=0, price=50.0),
        ]
        agg = aggregate_store_metrics(skus)
        assert agg.lost_revenue == 1000.0

    def test_demand_pattern_distribution(self):
        skus = [
            self._make(segment=InventorySegment.FAST_MOVERS),
            self._make(segment=InventorySegment.STABLE),
            self._make(segment=InventorySegment.STABLE),
            self._make(segment=InventorySegment.DEAD_INVENTORY_RISK),
        ]
        agg = aggregate_store_metrics(skus)
        assert agg.demand_pattern_distribution == {
            "fast_movers": 1, "stable": 2, "dead_inventory_risk": 1,
        }


# ============================================================================
# lost_revenue.py — Rule 9.2 AverageStockoutPrice
# ============================================================================

from app.engine.lost_revenue import average_stockout_price, lost_revenue_per_sku


class TestLostRevenuePerSku:
    def test_avg_price_with_data(self):
        assert average_stockout_price([100.0, 200.0, 150.0], None) == 150.0

    def test_avg_price_fallback_latest(self):
        assert average_stockout_price([], 120.0) == 120.0

    def test_avg_price_no_data(self):
        assert average_stockout_price([], None) == 0.0

    def test_lost_revenue_full(self):
        assert lost_revenue_per_sku(2.0, 5, [100.0, 200.0, 150.0], 120.0) == 1500.0

    def test_lost_revenue_zero_velocity(self):
        assert lost_revenue_per_sku(0.0, 5, [100.0], 120.0) == 0.0

    def test_lost_revenue_zero_stockout(self):
        assert lost_revenue_per_sku(2.0, 0, [100.0], 120.0) == 0.0


# ============================================================================
# price.py — Rule 12.1, 12.3
# ============================================================================

from app.engine.price import (
    PriceChange,
    calculate_elasticity,
    detect_price_changes,
)
from datetime import date as _date


class TestPriceTracking:
    def test_no_changes(self):
        prices = [(_date(2026,1,1), 100.0), (_date(2026,1,2), 100.0), (_date(2026,1,3), 100.0)]
        assert detect_price_changes(prices) == []

    def test_single_change(self):
        prices = [(_date(2026,1,1), 100.0), (_date(2026,1,2), 110.0), (_date(2026,1,3), 110.0)]
        changes = detect_price_changes(prices)
        assert len(changes) == 1
        assert changes[0].previous_price == 100.0
        assert changes[0].new_price == 110.0
        assert changes[0].delta_pct == 10.0

    def test_multiple_changes(self):
        prices = [
            (_date(2026,1,1), 100.0),
            (_date(2026,1,2), 110.0),
            (_date(2026,1,3), 95.0),
        ]
        changes = detect_price_changes(prices)
        assert len(changes) == 2

    def test_elasticity_positive_price_negative_demand(self):
        change = PriceChange(_date(2026,1,15), 100.0, 110.0, 10.0)
        before = [10.0] * 7
        after = [5.0] * 7
        sig = calculate_elasticity(change, before, after)
        assert sig is not None
        assert sig.velocity_before == 10.0
        assert sig.velocity_after == 5.0
        assert sig.price_impact_percent == -50.0

    def test_elasticity_insufficient_data(self):
        change = PriceChange(_date(2026,1,15), 100.0, 110.0, 10.0)
        before = [10.0] * 5
        after = [5.0] * 7
        assert calculate_elasticity(change, before, after) is None


# ============================================================================
# safety_stock.py — Rule 1.6
# ============================================================================

from app.engine.safety_stock import (
    calculate_recommendation,
    reorder_point,
    safety_stock,
)


class TestSafetyStock:
    def test_basic(self):
        assert safety_stock(2.0, 5) == 10
        assert safety_stock(0, 5) == 0

    def test_reorder_point(self):
        assert reorder_point(2.0, 7, 5) == 24

    def test_recommendation_critical(self):
        r = calculate_recommendation(current_stock=10, daily_velocity=2.0,
                                      lead_time_days=7, safety_days=5, reorder_for_days=30)
        assert r.days_until_reorder == 0
        assert r.recommended_order_qty == 60

    def test_recommendation_plenty(self):
        r = calculate_recommendation(current_stock=100, daily_velocity=2.0,
                                      lead_time_days=7, safety_days=5, reorder_for_days=30)
        assert r.days_until_reorder == 38

    def test_zero_velocity(self):
        r = calculate_recommendation(current_stock=100, daily_velocity=0,
                                      lead_time_days=7, safety_days=5, reorder_for_days=30)
        assert r.days_until_reorder is None
        assert r.recommended_order_qty == 0
