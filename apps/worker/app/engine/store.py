"""Store-level метрики: концентрация, demand pattern, warehouse health.

Реализует раздел 1.5 и Rule 13.2 спеки.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Optional
import numpy as np


@dataclass
class SkuValue:
    product_id: str
    value: float


def concentration_50(items: list[SkuValue]) -> int:
    """Минимальное число SKU, покрывающее >= 50% суммарного value."""
    if not items:
        return 0
    total = sum(i.value for i in items)
    if total <= 0:
        return 0
    sorted_items = sorted(items, key=lambda x: x.value, reverse=True)
    cumulative = 0.0
    threshold = total * 0.5
    for idx, item in enumerate(sorted_items, start=1):
        cumulative += item.value
        if cumulative >= threshold:
            return idx
    return len(sorted_items)


def demand_weight(adjusted_velocity: float, median_30d_velocity: float, price: float) -> float:
    """DemandWeight для demand_concentration_50 (раздел 1.5).

    Фоллбэк 1.0 для SKU без спроса — чтобы концентрация не вырождалась.
    Для health-score используется ДРУГОЙ вес (_demand_weight_for_health, фоллбэк 0).
    """
    if adjusted_velocity > 0:
        return adjusted_velocity * price
    if median_30d_velocity > 0:
        return median_30d_velocity * price
    return 1.0


def _demand_weight_for_health(adjusted_velocity: float, median_30d_velocity: float, price: float) -> float:
    """Вес спроса для warehouse_health_score. SKU без спроса (обе скорости 0) даёт
    ВЕС 0: товар без спроса и без наличия не должен снижать здоровье склада
    (решение заказчика 22.06.2026) — OOS «мёртвого» SKU это не упущенные продажи."""
    if adjusted_velocity > 0:
        return adjusted_velocity * price
    if median_30d_velocity > 0:
        return median_30d_velocity * price
    return 0.0


def demand_pattern(daily_velocities: list[float], min_days_for_pattern: int = 14) -> str:
    """Stable / unpredictable / seasonal_candidate / insufficient_history."""
    if len(daily_velocities) < min_days_for_pattern:
        return "insufficient_history"
    arr = np.array(daily_velocities, dtype=float)
    mean = arr.mean()
    if mean <= 0:
        return "insufficient_history"
    cv = arr.std() / mean
    if cv < 0.3:
        return "stable"
    if cv > 1.0:
        return "unpredictable"
    return "seasonal_candidate"


@dataclass
class SkuHealthInput:
    product_id: str
    health_score: int
    stock_quantity: int
    price: float
    adjusted_velocity: float
    median_30d_velocity: float
    is_out_of_stock: bool


def warehouse_health_score(skus: list[SkuHealthInput]) -> Optional[int]:
    """Rule 13.2: weighted SKU health - weighted stockout penalty."""
    if not skus:
        return None

    total_weight = sum(s.stock_quantity * s.price for s in skus)
    if total_weight <= 0:
        weighted_score = float(np.mean([s.health_score for s in skus]))
    else:
        weighted_score = sum(s.health_score * s.stock_quantity * s.price for s in skus) / total_weight

    total_demand = sum(_demand_weight_for_health(s.adjusted_velocity, s.median_30d_velocity, s.price) for s in skus)
    oos_demand = sum(
        _demand_weight_for_health(s.adjusted_velocity, s.median_30d_velocity, s.price)
        for s in skus if s.is_out_of_stock
    )
    stockout_share = oos_demand / total_demand if total_demand > 0 else 0.0
    final = max(0, min(100, weighted_score - stockout_share * 30))
    return int(round(final))


def health_label(score: int) -> str:
    if score >= 90:
        return "excellent"
    if score >= 75:
        return "good"
    if score >= 60:
        return "warning"
    if score >= 40:
        return "risky"
    return "critical"


def total_inventory_value(skus: list[SkuHealthInput]) -> float:
    return sum(s.stock_quantity * s.price for s in skus)


def frozen_inventory_value(skus: list[SkuHealthInput], coverage_days_per_sku: dict[str, Optional[float]]) -> float:
    """Сумма stock × price по SKU с coverage > 180 (dead inventory risk)."""
    frozen = 0.0
    for s in skus:
        cov = coverage_days_per_sku.get(s.product_id)
        if cov is not None and cov > 180:
            frozen += s.stock_quantity * s.price
    return frozen
