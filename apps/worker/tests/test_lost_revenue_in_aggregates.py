"""Тесты Rule 9.2 в store_aggregates.

После фикса aggregate_store_metrics использует AverageStockoutPrice если
переданы prices_during_stockout, иначе fallback на текущую цену.
"""
from __future__ import annotations

from app.engine.store_aggregates import SkuMetricRow, aggregate_store_metrics
from app.schemas import InventorySegment


def _row(**kwargs) -> SkuMetricRow:
    defaults = dict(
        product_id="x", stock_quantity=10, price=100.0,
        adjusted_velocity=2.0, median_30d_velocity=2.0,
        coverage_days=10.0, stockout_days=5, confidence_score=90.0,
        segment=InventorySegment.STABLE, sku_health_score=80.0,
        availability=True, prices_during_stockout=[],
    )
    defaults.update(kwargs)
    return SkuMetricRow(**defaults)


class TestLostRevenueRule9_2:
    """Rule 9.2: LostRevenue = vel × stockout × AverageStockoutPrice."""

    def test_uses_avg_stockout_price_when_provided(self):
        """Если prices_during_stockout есть — AVG используется (не текущая цена)."""
        skus = [_row(
            adjusted_velocity=2.0, stockout_days=5,
            price=200.0,  # текущая цена
            prices_during_stockout=[100.0, 100.0, 100.0],  # AVG = 100
        )]
        agg = aggregate_store_metrics(skus)
        # lost = 2 × 5 × AVG(100) = 1000 (не 2×5×200 = 2000)
        assert agg.lost_revenue == 1000.0

    def test_fallback_to_current_price_when_no_history(self):
        """Если prices_during_stockout пуст — fallback на s.price."""
        skus = [_row(
            adjusted_velocity=2.0, stockout_days=5,
            price=150.0,
            prices_during_stockout=[],  # нет истории
        )]
        agg = aggregate_store_metrics(skus)
        # lost = 2 × 5 × 150 = 1500
        assert agg.lost_revenue == 1500.0

    def test_zero_stockout_zero_lost(self):
        """stockout=0 → lost = 0 даже при ненулевой velocity."""
        skus = [_row(adjusted_velocity=2.0, stockout_days=0, price=100.0)]
        agg = aggregate_store_metrics(skus)
        assert agg.lost_revenue == 0.0

    def test_zero_velocity_zero_lost(self):
        """velocity=0 → lost = 0 даже при stockout > 0."""
        skus = [_row(adjusted_velocity=0.0, stockout_days=10, price=100.0)]
        agg = aggregate_store_metrics(skus)
        assert agg.lost_revenue == 0.0

    def test_multi_sku_sum(self):
        """Сумма lost_revenue по нескольким SKU."""
        skus = [
            _row(product_id="a", adjusted_velocity=1.0, stockout_days=10,
                  price=100.0, prices_during_stockout=[100.0] * 10),  # lost=1000
            _row(product_id="b", adjusted_velocity=3.0, stockout_days=5,
                  price=50.0, prices_during_stockout=[50.0] * 5),     # lost=750
            _row(product_id="c", adjusted_velocity=0.0, stockout_days=20,
                  price=200.0),                                        # lost=0
        ]
        agg = aggregate_store_metrics(skus)
        assert agg.lost_revenue == 1750.0  # 1000 + 750 + 0

    def test_high_avg_price_during_stockout_shows_higher_loss(self):
        """Реалистичный кейс: товар подорожал во время stockout (потеря выше)."""
        skus = [_row(
            adjusted_velocity=5.0, stockout_days=10,
            price=100.0,  # текущая цена (стандартная)
            prices_during_stockout=[150.0] * 10,  # был дороже на 50%
        )]
        agg = aggregate_store_metrics(skus)
        # При AVG=150: lost = 5×10×150 = 7500
        # Без правильной формулы было бы 5×10×100 = 5000 — занижение!
        assert agg.lost_revenue == 7500.0
