"""Lost revenue по Rule 9.2 с правильной AverageStockoutPrice."""
from __future__ import annotations
from typing import Optional


def average_stockout_price(
    prices_during_stockout: list[float],
    latest_known_price: Optional[float],
) -> float:
    if prices_during_stockout:
        return sum(prices_during_stockout) / len(prices_during_stockout)
    return latest_known_price or 0.0


def lost_revenue_per_sku(
    adjusted_velocity: float,
    stockout_days: int,
    prices_during_stockout: list[float],
    latest_known_price: Optional[float],
) -> float:
    if adjusted_velocity <= 0 or stockout_days <= 0:
        return 0.0
    avg_price = average_stockout_price(prices_during_stockout, latest_known_price)
    return adjusted_velocity * stockout_days * avg_price
