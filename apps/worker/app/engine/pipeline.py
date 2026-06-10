"""Pipeline расчёта метрик для одного SKU за период.

Координирует events -> velocity -> confidence -> coverage -> health.

Изменения по точности (аудит):

БАГ 1 исправлен: MISSING_DATA дни БОЛЬШЕ НЕ СЧИТАЮТСЯ stockout. Раньше день без snapshot‘а
имел availability=False и считался как stockout_day → это завышало lost_revenue и может зажигать
ложные repeated_stockout алерты. Теперь missing day — это «не знаем», вне знаменателя.
Штраф за него в confidence остаётся.

БАГ 4 исправлен: confidence теперь штрафует за малое количество sales_like дней (< 7).

БАГ 2 исправлен: добавлен правильный prefer-historical-median через опциональный
параметр history_for_median. Если вызывающий (recalc.py) передаёт 30-day pre-period sales,
эта история используется. Иначе fallback на текущий период.

БАГ 9 исправлен: TVeloMetric теперь возвращает median_30d_velocity отдельным полем.
Раньше в store-level demand_weight подставлялся adjusted_velocity как proxy.
"""
from __future__ import annotations
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Optional

from app.engine import coverage as cov_mod
from app.engine import health as health_mod
from app.engine import velocity as vel_mod
from app.config import settings
from app.engine.confidence import calculate_confidence
from app.schemas import EventType, InventorySegment, TVeloMetric


@dataclass
class DailyAggregate:
    """Агрегат данных по SKU на одну дату (в TZ селлера)."""
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

    # КЛАМП ОКНА ПО ПЕРВОМУ СНАПШОТУ.
    # При миграции на новый инстанс Supabase история снапшотов начинается не с
    # начала 90-дневного окна (cutover ~22.05.2026). Дни до первого реального
    # снапшота — это «трекинг ещё не вёлся», а НЕ «потеряли данные». Без клампа
    # они идут как MISSING_DATA и роняют ДСТ в пол (40%) почти всем SKU.
    # Отбрасываем ВЕДУЩИЕ MISSING_DATA дни (для расчёта), period_start НЕ двигаем.
    # Дыры ВНУТРИ периода (реальные пропуски синка) и хвостовые
    # пропуски остаются — это честный сигнал. Скорость не меняется: у отброшенных
    # дней не было ни sales_like, ни in_stock — пересчитываются только
    # confidence и health по фактически покрытому окну.
    first_real_idx = next(
        (i for i, a in enumerate(daily_aggregates)
         if a.event_type != EventType.MISSING_DATA),
        None,
    )
    if first_real_idx is not None and first_real_idx > 0:
        daily_aggregates = daily_aggregates[first_real_idx:]
    # ВАЖНО: period_start/period_end НЕ меняем (это ключ tvelo_metrics, по нему UI
    # выбирает окно 7/30/90 — смена ключа плодит дубли). Штрафы confidence и health
    # считаем по фактически покрытому окну effective_period_days.
    effective_period_days = (
        (period_end - daily_aggregates[0].day).days + 1
        if daily_aggregates else period_days
    )

    # MISSING_DATA дни исключаются из in_stock/stockout — это «не знаем», не подтверждённый OOS.
    in_stock_days = sum(
        1 for a in daily_aggregates
        if a.availability and a.event_type != EventType.MISSING_DATA
    )
    stockout_days = sum(
        1 for a in daily_aggregates
        if (not a.availability) and a.event_type != EventType.MISSING_DATA
    )

    repl_days = sum(1 for a in daily_aggregates if a.event_type == EventType.REPLENISHMENT_LIKE)
    anom_days = sum(1 for a in daily_aggregates if a.event_type == EventType.ANOMALY_LIKE)
    miss_days = sum(1 for a in daily_aggregates if a.event_type == EventType.MISSING_DATA)

    excluded_in_stock_days = sum(
        1 for a in daily_aggregates if a.excluded_from_confirmed_metrics and a.availability
    )

    sales_like_deltas = [
        a.delta_stock for a in daily_aggregates
        if a.event_type == EventType.SALES_LIKE and a.delta_stock is not None
        and not a.excluded_from_confirmed_metrics
    ]
    sales_like_days = len(sales_like_deltas)
    consumption = vel_mod.confirmed_consumption(sales_like_deltas)
    conf_vel = vel_mod.confirmed_velocity(consumption, in_stock_days)

    # Медиана для estimated_continuity:
    # - Если вызывающий передал history_for_median (преферабльно: 30-day pre-period sales) — берём её.
    # - Иначе fallback: текущие sales_like_deltas (циклично, но лучше чем ничего).
    if history_for_median is None:
        history_for_median = [abs(d) for d in sales_like_deltas]
    median_30d_vel = vel_mod.median_30d_velocity(history_for_median)

    # Деадлок-в-0 fix: если чистых sales_like дней мало/нет, медиана = 0 и
    # adjusted_velocity схлопывается в 0 — товар выглядит мёртвым, хотя реально
    # расходовался спайками (всё ушло в anomaly_like/excluded). Берём грубую
    # soft-velocity по всем дням-расхода без экстремальных выбросов. Confidence
    # при этом остаётся низкой (мало sales_like) — оценка честно помечена как грубая.
    if median_30d_vel <= 0:
        soft_consumption = [
            abs(a.delta_stock) for a in daily_aggregates
            if a.delta_stock is not None and a.delta_stock < 0
            and a.event_type in (EventType.SALES_LIKE, EventType.ANOMALY_LIKE)
        ]
        median_30d_vel = vel_mod.soft_velocity(
            soft_consumption, settings.soft_velocity_extreme_factor
        )

    adj_vel = vel_mod.adjusted_velocity(consumption, median_30d_vel, excluded_in_stock_days, in_stock_days)

    confidence = calculate_confidence(
        effective_period_days, repl_days, anom_days, miss_days,
        sales_like_days=sales_like_days,
    )
    cov_days = cov_mod.coverage_days(current_stock, adj_vel)
    health = health_mod.sku_health_score(stockout_days, effective_period_days, cov_days, confidence.final)
    segment = health_mod.inventory_segment(cov_days)
    # Мёртвый неликвид: coverage=None (adj_vel=0 даже после soft → расхода вообще
    # не было), но товар реально лежал в наличии достаточно дней (in_stock_days >=
    # порога) при ненулевом остатке. Без этого он молча уходит в INSUFFICIENT_DATA
    # и выпадает из frozen/dead-метрик. Страж по in_stock_days отсекает и
    # «всё пропущено» (in_stock≈0), и новый товар (мало дней наблюдения).
    if (
        segment == InventorySegment.INSUFFICIENT_DATA
        and current_stock > 0
        and in_stock_days >= settings.dead_min_tracked_days
    ):
        segment = InventorySegment.DEAD_INVENTORY_RISK

    return TVeloMetric(
        product_id=product_id,
        period_start=period_start,
        period_end=period_end,
        confirmed_velocity=round(conf_vel, 4),
        adjusted_velocity=round(adj_vel, 4),
        median_30d_velocity=round(median_30d_vel, 4),
        confidence_score=confidence.final,
        confidence_breakdown=confidence,
        stockout_days=stockout_days,
        in_stock_days=in_stock_days,
        coverage_days=round(cov_days, 2) if cov_days is not None else None,
        current_stock=current_stock,
        sku_health_score=health.final,
        health_breakdown=health,
        segment=segment,
    )


def period_dates(period_start: date, period_end: date) -> list[date]:
    days = (period_end - period_start).days + 1
    return [period_start + timedelta(days=i) for i in range(days)]
