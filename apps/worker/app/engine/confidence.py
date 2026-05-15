"""Confidence score. Правила 6.1-6.7."""
from __future__ import annotations
from app.config import settings
from app.schemas import ConfidenceBreakdown


def calculate_confidence(
    period_days: int,
    replenishment_days: int,
    anomaly_days: int,
    missing_data_days: int,
) -> ConfidenceBreakdown:
    initial = settings.initial_confidence
    if period_days <= 0:
        return ConfidenceBreakdown(initial=initial, replenishment_like=0.0, anomaly_like=0.0, missing_data=0.0, final=initial)
    repl_pen = replenishment_days / period_days * 100
    anom_pen = anomaly_days / period_days * 100
    miss_pen = missing_data_days / period_days * 100
    final = max(settings.confidence_floor, initial - repl_pen - anom_pen - miss_pen)
    return ConfidenceBreakdown(
        initial=initial,
        replenishment_like=round(repl_pen, 2),
        anomaly_like=round(anom_pen, 2),
        missing_data=round(miss_pen, 2),
        final=round(final, 2),
    )
