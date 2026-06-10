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


def soft_velocity(consumption_magnitudes: Sequence[float], extreme_factor: float = 5.0) -> float:
    """Грубая оценка дневной скорости, когда чистых sales_like дней мало/нет.

    Берёт магнитуды всех дней-расхода (sales_like + anomaly_like), отсекает
    экстремальные выбросы (> extreme_factor × медианы — вероятные глитчи/пересчёты)
    и возвращает медиану остатка. 0.0 если данных нет. Назначение: не дать
    adjusted_velocity схлопнуться в 0 для товаров, которые реально расходовались
    спайками (всё ушло в anomaly_like/excluded) и иначе выглядят мёртвыми.
    """
    vals = [float(v) for v in consumption_magnitudes if v > 0]
    if not vals:
        return 0.0
    base = float(median(vals))
    if base > 0:
        trimmed = [v for v in vals if v <= extreme_factor * base]
        if trimmed:
            vals = trimmed
    return float(median(vals))


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
