"""Pipeline расчёта метрик для одного SKU за период."""
from __future__ import annotations
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Optional

from app.engine import coverage as cov_mod
from app.engine import health as health_mod
from app.engine import velocity as vel_mod
from app.engine.confidence import calculate_confidence
from app.schemas import EventType, TVeloMetric


@dataclass
class DailyAggregate:
    day: date
    availability: bool
    end_of_day_stock: int
    price: float
    event_type: EventType
    delta_stock: Optional[int]
    excluded_from_confirmed_metrics: bool


def compute_metrics_for_sku(
    product_id: str,
    period_start: date,
    period_end: date,
    daily_aggregates: list[DailyAggregate],
    current_stock: int,
    history_for_median: Optional[list[float]] = None,
) -> TVeloMetric:
    period_days = (period_end - period_start).days + 1
    in_stock_days = cov_mod.count_in_stock_days(a.availability for a in daily_aggregates)
    stockout_days = cov_mod.count_stockout_days(a.availability for a in daily_aggregates)
    repl_days = sum(1 for a in daily_aggregates if a.event_type == EventType.REPLENISHMENT_LIKE)
    anom_days = sum(1 for a in daily_aggregates if a.event_type == EventType.ANOMALY_LIKE)
    miss_days = sum(1 for a in daily_aggregates if a.event_type == EventType.MISSING_DATA)
    excluded_in_stock_days = sum(1 for a in daily_aggregates if a.excluded_from_confirmed_metrics and a.availability)
    sales_like_deltas = [
        a.delta_stock for a in daily_aggregates
        if a.event_type == EventType.SALES_LIKE and a.delta_stock is not None
        and not a.excluded_from_confirmed_metrics
    ]
    consumption = vel_mod.confirmed_consumption(sales_like_deltas)
    conf_vel = vel_mod.confirmed_velocity(consumption, in_stock_days)
    if history_for_median is None:
        history_for_median = [abs(d) for d in sales_like_deltas]
    median_30d_vel = vel_mod.median_30d_velocity(history_for_median)
    adj_vel = vel_mod.adjusted_velocity(consumption, median_30d_vel, excluded_in_stock_days, in_stock_days)
    confidence = calculate_confidence(period_days, repl_days, anom_days, miss_days)
    cov_days = cov_mod.coverage_days(current_stock, adj_vel)
    health = health_mod.sku_health_score(stockout_days, period_days, cov_days, confidence.final)
    segment = health_mod.inventory_segment(cov_days)
    return TVeloMetric(
        product_id=product_id, period_start=period_start, period_end=period_end,
        confirmed_velocity=round(conf_vel, 4), adjusted_velocity=round(adj_vel, 4),
        confidence_score=confidence.final, confidence_breakdown=confidence,
        stockout_days=stockout_days, in_stock_days=in_stock_days,
        coverage_days=round(cov_days, 2) if cov_days is not None else None,
        current_stock=current_stock, sku_health_score=health.final,
        health_breakdown=health, segment=segment,
    )


def period_dates(period_start: date, period_end: date) -> list[date]:
    days = (period_end - period_start).days + 1
    return [period_start + timedelta(days=i) for i in range(days)]
