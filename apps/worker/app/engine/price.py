"""Price change detection и price elasticity. Rule 12.x спеки."""
from __future__ import annotations
from dataclasses import dataclass
from datetime import date
from typing import Optional


@dataclass
class PriceChange:
    day: date
    previous_price: float
    new_price: float
    delta_pct: float


def detect_price_changes(daily_prices: list[tuple[date, float]]) -> list[PriceChange]:
    if len(daily_prices) < 2:
        return []
    out: list[PriceChange] = []
    prev_day, prev_price = daily_prices[0]
    for day, price in daily_prices[1:]:
        if prev_price > 0 and price != prev_price:
            delta_pct = (price - prev_price) / prev_price * 100
            out.append(PriceChange(day=day, previous_price=prev_price, new_price=price, delta_pct=delta_pct))
        prev_day, prev_price = day, price
    return out


@dataclass
class ElasticitySignal:
    change_day: date
    velocity_before: float
    velocity_after: float
    price_impact_percent: float
    days_before: int
    days_after: int


def calculate_elasticity(
    change: PriceChange,
    sales_by_day_before: list[float],
    sales_by_day_after: list[float],
    min_days_each_side: int = 7,
) -> Optional[ElasticitySignal]:
    if len(sales_by_day_before) < min_days_each_side or len(sales_by_day_after) < min_days_each_side:
        return None
    vel_before = sum(sales_by_day_before) / len(sales_by_day_before)
    vel_after = sum(sales_by_day_after) / len(sales_by_day_after)
    if vel_before <= 0:
        return None
    impact = (vel_after - vel_before) / vel_before * 100
    return ElasticitySignal(
        change_day=change.day,
        velocity_before=round(vel_before, 4),
        velocity_after=round(vel_after, 4),
        price_impact_percent=round(impact, 2),
        days_before=len(sales_by_day_before),
        days_after=len(sales_by_day_after),
    )
