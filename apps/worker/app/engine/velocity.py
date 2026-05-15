"""TVelo: confirmed и adjusted velocity. Правила 5.1-5.7."""
from __future__ import annotations
from statistics import median
from typing import Sequence


def confirmed_consumption(sales_like_deltas: Sequence[int]) -> int:
    return sum(abs(d) for d in sales_like_deltas)


def confirmed_velocity(consumption: float, in_stock_days: int) -> float:
    if in_stock_days <= 0:
        return 0.0
    return consumption / in_stock_days


def median_30d_velocity(daily_clean_consumption: Sequence[float]) -> float:
    if not daily_clean_consumption:
        return 0.0
    return float(median(daily_clean_consumption))


def estimated_continuity(median_30d_vel: float, excluded_in_stock_days: int) -> float:
    return median_30d_vel * excluded_in_stock_days


def adjusted_velocity(
    consumption: float,
    median_30d_vel: float,
    excluded_in_stock_days: int,
    in_stock_days: int,
) -> float:
    if in_stock_days <= 0:
        return 0.0
    return (consumption + estimated_continuity(median_30d_vel, excluded_in_stock_days)) / in_stock_days
