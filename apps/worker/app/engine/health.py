"""SKU Inventory Health Score + сегментация + underestimated SKU. Правила 13.1, 13.3, 13.4."""
from __future__ import annotations
from typing import Optional
from app.schemas import HealthBreakdown, InventorySegment


def sku_health_score(
    stockout_days: int,
    period_days: int,
    coverage_days_value: Optional[float],
    confidence_score: float,
) -> HealthBreakdown:
    stockout_pen = min(40.0, stockout_days / period_days * 40) if period_days > 0 else 0.0
    low_cov_pen = 0.0
    dead_pen = 0.0
    if coverage_days_value is not None:
        cov = coverage_days_value
        if cov <= 7:
            low_cov_pen = (7 - max(cov, 0)) / 7 * 25
        if cov > 180:
            dead_pen = min(25.0, (cov - 180) / 180 * 25)
    conf_pen = max(0.0, (100 - confidence_score) * 0.2)
    final = max(0, min(100, 100 - stockout_pen - low_cov_pen - dead_pen - conf_pen))
    return HealthBreakdown(
        stockout=round(stockout_pen, 2),
        low_coverage=round(low_cov_pen, 2),
        dead_inventory=round(dead_pen, 2),
        confidence=round(conf_pen, 2),
        final=int(round(final)),
    )


def inventory_segment(coverage_days_value: Optional[float]) -> InventorySegment:
    if coverage_days_value is None:
        return InventorySegment.INSUFFICIENT_DATA
    cov = coverage_days_value
    if cov < 14:
        return InventorySegment.FAST_MOVERS
    if cov <= 60:
        return InventorySegment.STABLE
    if cov <= 180:
        return InventorySegment.SLOW_MOVERS
    return InventorySegment.DEAD_INVENTORY_RISK


def is_underestimated_sku(
    stockout_days: int,
    adjusted_velocity: float,
    median_store_velocity: float,
    confidence_score: float,
) -> bool:
    return stockout_days > 0 and adjusted_velocity > median_store_velocity and confidence_score >= 70
