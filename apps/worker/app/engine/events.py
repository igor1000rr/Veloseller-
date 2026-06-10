# Классификация snapshot-событий. Правила 1.3, 2.2, 3.1-3.6.
#
# Май 2026: добавлена поддержка праздников (event_date) для правильного
# anomaly-расчёта. Если день — федеральный праздник РФ, любая необычная динамика
# (резкое снижение или пик) не классифицируется как anomaly_like, а остаётся
# sales_like/replenishment_like НО с флагом excluded=True чтобы не ломать медиану
from __future__ import annotations
from datetime import date
from typing import Optional
from app.config import settings
from app.schemas import EventType
from app.holidays import is_holiday


def classify_event(
    delta_stock: Optional[int],
    median_30d_abs_delta: Optional[float],
    previous_exists: bool,
    is_missing: bool = False,
    event_date: Optional[date] = None,
) -> tuple[EventType, bool]:
    """Возвращает (event_type, excluded_from_confirmed_metrics).

    Args:
        delta_stock: разница остатков между днями (отрицательная = продажа)
        median_30d_abs_delta: медиана абсолютных дельт за 30 дней
        previous_exists: был ли предыдущий snapshot
        is_missing: нет данных за этот день
        event_date: дата события. Если это праздник — не классифицируем как anomaly
            и помечаем excluded=True (чтобы sales_like не ломали медиану)
    """
    if is_missing:
        return EventType.MISSING_DATA, True
    if not previous_exists:
        return EventType.FIRST_SNAPSHOT, True
    if delta_stock is None:
        return EventType.MISSING_DATA, True
    if delta_stock == 0:
        return EventType.NO_CHANGE, False

    # Если это праздник — исключаем из расчёта медианы и anomaly-проверки.
    # Сохраняем базовый тип события (продажа / пополнение) но помечаем
    # excluded=True чтобы эти дни не смещали медиану продаж.
    if event_date is not None and is_holiday(event_date):
        if delta_stock > 0:
            return EventType.REPLENISHMENT_LIKE, True
        return EventType.SALES_LIKE, True

    if delta_stock > 0:
        return EventType.REPLENISHMENT_LIKE, True
    if (
        median_30d_abs_delta is not None
        and median_30d_abs_delta > 0
        and abs(delta_stock) > max(
            float(settings.anomaly_floor),
            settings.anomaly_multiplier * median_30d_abs_delta,
        )
    ):
        return EventType.ANOMALY_LIKE, True
    return EventType.SALES_LIKE, False
