"""Confidence score. Правила 6.1-6.7 + low-history penalty.

Изменение vs спеки: добавлен штраф за малое количество подтверждённых sales_like
дней (< 7). Без этого новый SKU с 2-мя днями данных получал 95% confidence (нет penalties,
при этом выборка полностью непредставительная. Сейчас штраф линейный: 0 сейлс-дней → -35%, 6 → -5%, 7+ → 0%.
"""
from __future__ import annotations
from app.config import settings
from app.schemas import ConfidenceBreakdown

# Порог: ниже этого числа sales_like-дней выборка не представительна.
# 7 выбрано как минимум рабочей недели (разные дни недели имеют разный спрос).
MIN_REPRESENTATIVE_DAYS = 7
# Максимальный штраф за малую историю — 35 пунктов (при 0 дней подтверждённых продаж).
MAX_LOW_HISTORY_PENALTY = 35.0


def calculate_confidence(
    period_days: int,
    replenishment_days: int,
    anomaly_days: int,
    missing_data_days: int,
    sales_like_days: int = -1,  # default -1 → бэк-компатибильность (не штрафуем)
) -> ConfidenceBreakdown:
    initial = settings.initial_confidence
    if period_days <= 0:
        return ConfidenceBreakdown(
            initial=initial, replenishment_like=0.0, anomaly_like=0.0,
            missing_data=0.0, low_history=0.0, final=initial,
        )
    repl_pen = replenishment_days / period_days * 100
    anom_pen = anomaly_days / period_days * 100
    miss_pen = missing_data_days / period_days * 100

    # Low-history penalty: линейный от 0 до MAX_LOW_HISTORY_PENALTY при sales_like_days в [0; MIN_REPRESENTATIVE_DAYS).
    # При sales_like_days = -1 (legacy/не передали) — не штрафуем (бэк-компатибильность).
    low_pen = 0.0
    if sales_like_days >= 0 and sales_like_days < MIN_REPRESENTATIVE_DAYS:
        low_pen = MAX_LOW_HISTORY_PENALTY * (1 - sales_like_days / MIN_REPRESENTATIVE_DAYS)

    final = max(settings.confidence_floor, initial - repl_pen - anom_pen - miss_pen - low_pen)
    return ConfidenceBreakdown(
        initial=initial,
        replenishment_like=round(repl_pen, 2),
        anomaly_like=round(anom_pen, 2),
        missing_data=round(miss_pen, 2),
        low_history=round(low_pen, 2),
        final=round(final, 2),
    )
