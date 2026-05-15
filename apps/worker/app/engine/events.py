"""Классификация snapshot-событий. Правила 1.3, 2.2, 3.1-3.6."""
from __future__ import annotations
from typing import Optional
from app.config import settings
from app.schemas import EventType


def classify_event(
    delta_stock: Optional[int],
    median_30d_abs_delta: Optional[float],
    previous_exists: bool,
    is_missing: bool = False,
) -> tuple[EventType, bool]:
    """Возвращает (event_type, excluded_from_confirmed_metrics)."""
    if is_missing:
        return EventType.MISSING_DATA, True
    if not previous_exists:
        return EventType.FIRST_SNAPSHOT, True
    if delta_stock is None:
        return EventType.MISSING_DATA, True
    if delta_stock == 0:
        return EventType.NO_CHANGE, False
    if delta_stock > 0:
        return EventType.REPLENISHMENT_LIKE, True
    if (
        median_30d_abs_delta is not None
        and median_30d_abs_delta > 0
        and abs(delta_stock) > settings.anomaly_multiplier * median_30d_abs_delta
    ):
        return EventType.ANOMALY_LIKE, True
    return EventType.SALES_LIKE, False
