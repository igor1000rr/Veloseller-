"""Coverage, stockout, reorder, lost revenue. Правила 4.x, 7.x, 8.1, 9.1, 9.2."""
from __future__ import annotations
from typing import Iterable, Optional


def coverage_days(current_stock: int, adjusted_vel: float) -> Optional[float]:
    if adjusted_vel <= 0:
        return None
    return current_stock / adjusted_vel


def reorder_quantity(adjusted_vel: float, reorder_days: int) -> float:
    return adjusted_vel * reorder_days


def count_stockout_days(daily_availability: Iterable[bool]) -> int:
    return sum(1 for a in daily_availability if not a)


def count_in_stock_days(daily_availability: Iterable[bool]) -> int:
    return sum(1 for a in daily_availability if a)


def lost_units(adjusted_vel: float, stockout_days: int) -> float:
    return adjusted_vel * stockout_days


def lost_revenue(adjusted_vel: float, stockout_days: int, avg_stockout_price: float) -> float:
    return lost_units(adjusted_vel, stockout_days) * avg_stockout_price
