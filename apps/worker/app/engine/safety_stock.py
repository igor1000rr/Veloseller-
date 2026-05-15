"""Lead time и safety stock (Rule 1.6).

LeadTime — дней от заказа до прибытия товара.
SafetyStock = DailyVelocity × SafetyDays — буфер на колебания спроса/доставки.
ReorderPoint = LeadTime × DailyVelocity + SafetyStock — когда заказывать.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Optional


@dataclass
class ReorderRecommendation:
    safety_stock: int
    reorder_point: int
    days_until_reorder: Optional[int]
    recommended_order_qty: int


def safety_stock(daily_velocity: float, safety_days: int) -> int:
    """SafetyStock = DailyVelocity × SafetyDays."""
    return max(0, int(round(daily_velocity * safety_days)))


def reorder_point(daily_velocity: float, lead_time_days: int, safety_days: int) -> int:
    """ReorderPoint = LeadTime × DailyVelocity + SafetyStock."""
    return max(0, int(round(daily_velocity * lead_time_days + safety_stock(daily_velocity, safety_days))))


def calculate_recommendation(
    current_stock: int,
    daily_velocity: float,
    lead_time_days: int,
    safety_days: int,
    reorder_for_days: int,
) -> ReorderRecommendation:
    """Полная рекомендация: когда заказывать и сколько."""
    ss = safety_stock(daily_velocity, safety_days)
    rp = reorder_point(daily_velocity, lead_time_days, safety_days)

    days_until_reorder: Optional[int]
    if daily_velocity <= 0:
        days_until_reorder = None
    else:
        # Когда остаток упадёт до reorder_point
        stock_above_rp = current_stock - rp
        if stock_above_rp <= 0:
            days_until_reorder = 0
        else:
            days_until_reorder = int(stock_above_rp / daily_velocity)

    recommended_qty = max(0, int(round(daily_velocity * reorder_for_days)))

    return ReorderRecommendation(
        safety_stock=ss,
        reorder_point=rp,
        days_until_reorder=days_until_reorder,
        recommended_order_qty=recommended_qty,
    )
