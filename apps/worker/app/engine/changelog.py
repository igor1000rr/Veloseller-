"""Changelog — человекочитаемые записи о событиях SKU. Rule 11.x спеки."""
from __future__ import annotations
from datetime import date
from typing import Optional
from app.schemas import EventType


def event_message(event_type: EventType, delta_stock: Optional[int]) -> tuple[str, float]:
    delta_str = "" if delta_stock is None else f" (Δ={delta_stock:+d})"
    if event_type == EventType.FIRST_SNAPSHOT:
        return ("Первое подключение SKU — точка отсчёта", 0.0)
    if event_type == EventType.NO_CHANGE:
        return ("Без изменений", 0.0)
    if event_type == EventType.SALES_LIKE:
        return (f"Продажа{delta_str}", 0.0)
    if event_type == EventType.REPLENISHMENT_LIKE:
        return (f"Пополнение склада{delta_str} — день исключён из расчёта скорости", -1.0)
    if event_type == EventType.ANOMALY_LIKE:
        return (f"Аномалия{delta_str} — резкое снижение, не похоже на продажи", -1.0)
    if event_type == EventType.MISSING_DATA:
        return ("Нет данных за день", -1.0)
    if event_type == EventType.RECOUNT_LIKE:
        return ("Похоже на инвентаризацию/пересчёт", -1.0)
    return ("Неизвестное событие", 0.0)
