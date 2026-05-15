"""Сборка store_metrics из массива посчитанных SKU-метрик.

Реализует раздел 1.5 спеки + Rule 13.2 (warehouse health).
"""
from __future__ import annotations
from collections import Counter
from dataclasses import dataclass
from typing import Optional

from app.engine.coverage import lost_revenue as lost_revenue_fn
from app.engine.store import (
    SkuHealthInput,
    SkuValue,
    concentration_50,
    demand_weight,
    warehouse_health_score,
)
from app.schemas import InventorySegment


@dataclass
class SkuMetricRow:
    """Композит данных по SKU для store-агрегатов."""
    product_id: str
    stock_quantity: int
    price: float
    adjusted_velocity: float
    median_30d_velocity: float
    coverage_days: Optional[float]
    stockout_days: int
    confidence_score: float
    segment: Optional[InventorySegment]
    sku_health_score: Optional[float]
    availability: bool


@dataclass
class StoreMetricsAggregate:
    total_sku_count: int
    oos_sku_count: int
    low_stock_sku_count: int
    dead_inventory_sku_count: int
    inventory_concentration_50: Optional[int]
    demand_concentration_50: Optional[int]
    total_inventory_value: float
    store_frozen_inventory_value: float
    lost_revenue: float
    warehouse_health_score: Optional[float]
    demand_pattern_distribution: dict[str, int]


def aggregate_store_metrics(skus: list[SkuMetricRow]) -> StoreMetricsAggregate:
    """Собрать все store-level метрики из массива SKU."""
    if not skus:
        return StoreMetricsAggregate(
            total_sku_count=0, oos_sku_count=0, low_stock_sku_count=0,
            dead_inventory_sku_count=0, inventory_concentration_50=None,
            demand_concentration_50=None, total_inventory_value=0.0,
            store_frozen_inventory_value=0.0, lost_revenue=0.0,
            warehouse_health_score=None, demand_pattern_distribution={},
        )

    total = len(skus)
    oos = sum(1 for s in skus if not s.availability)
    low_stock = sum(1 for s in skus if s.coverage_days is not None and s.coverage_days <= 7)
    dead = sum(1 for s in skus if s.coverage_days is not None and s.coverage_days > 180)

    # Inventory concentration — по stock × price
    inv_items = [SkuValue(s.product_id, s.stock_quantity * s.price) for s in skus]
    inv_conc = concentration_50(inv_items) or None

    # Demand concentration — по DemandWeight
    dem_items = [
        SkuValue(s.product_id, demand_weight(s.adjusted_velocity, s.median_30d_velocity, s.price))
        for s in skus
    ]
    dem_conc = concentration_50(dem_items) or None

    total_value = sum(s.stock_quantity * s.price for s in skus)
    frozen_value = sum(
        s.stock_quantity * s.price for s in skus
        if s.coverage_days is not None and s.coverage_days > 180
    )

    # Lost revenue: по каждому SKU с OOS считаем lost = adj_vel × stockout_days × price
    total_lost = sum(
        lost_revenue_fn(s.adjusted_velocity, s.stockout_days, s.price)
        for s in skus
    )

    # Warehouse health (Rule 13.2)
    health_inputs = [
        SkuHealthInput(
            product_id=s.product_id,
            health_score=int(s.sku_health_score) if s.sku_health_score is not None else 50,
            stock_quantity=s.stock_quantity,
            price=s.price,
            adjusted_velocity=s.adjusted_velocity,
            median_30d_velocity=s.median_30d_velocity,
            is_out_of_stock=not s.availability,
        )
        for s in skus
    ]
    wh_score = warehouse_health_score(health_inputs)

    # Demand pattern distribution — по сегментам
    seg_counter: Counter = Counter()
    for s in skus:
        if s.segment is not None:
            seg_counter[s.segment.value] += 1

    return StoreMetricsAggregate(
        total_sku_count=total,
        oos_sku_count=oos,
        low_stock_sku_count=low_stock,
        dead_inventory_sku_count=dead,
        inventory_concentration_50=inv_conc,
        demand_concentration_50=dem_conc,
        total_inventory_value=round(total_value, 2),
        store_frozen_inventory_value=round(frozen_value, 2),
        lost_revenue=round(total_lost, 2),
        warehouse_health_score=float(wh_score) if wh_score is not None else None,
        demand_pattern_distribution=dict(seg_counter),
    )
