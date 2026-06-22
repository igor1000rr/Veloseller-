"""Построение дневных агрегатов из снапшотов для recalc.

Вынесено из recalc.py 05.06.2026 (инцидент egress): файл recalc.py перерос
лимит передачи MCP, логика разнесена по модулям без изменения поведения.
recalc.py реэкспортирует эти функции — внешние импорты не меняются.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from statistics import median as _median

from app.engine.events import classify_event
from app.engine.pipeline import DailyAggregate
from app.holidays import is_holiday
from app.logger import logger
from app.schemas import EventType


def _extract_pre_period_sales_deltas(snapshots_rows, period_start, seller_tz):
    """Медиана продаж до периода (для anomaly seed). Праздники исключаются."""
    by_day = {}
    for row in sorted(snapshots_rows, key=lambda r: r["snapshot_time"]):
        ts = datetime.fromisoformat(row["snapshot_time"].replace("Z", "+00:00"))
        local_day = ts.astimezone(seller_tz).date()
        if local_day < period_start:
            by_day[local_day] = row
    if not by_day:
        return []
    sorted_days = sorted(by_day.keys())
    deltas = []
    prev_day = None
    prev_stock = None
    for day in sorted_days:
        stock = int(by_day[day]["stock_quantity"])
        if prev_stock is not None and prev_day is not None:
            d = stock - prev_stock
            # Праздники не попадают в медиану: в них продажи ведут себя аномально
            if d < 0 and not is_holiday(day):
                days_gap = max(1, (day - prev_day).days)
                per_day_delta = abs(d) / days_gap
                deltas.append(float(per_day_delta))
        prev_stock = stock
        prev_day = day
    if len(deltas) >= 3:
        med = _median(deltas)
        if med > 0:
            deltas = [d for d in deltas if d <= 5 * med]
    return deltas


def build_daily_aggregates(snapshots_rows, period_start, period_end, seller_tz):
    """Строит dayly aggregates из snapshots. Праздники (федеральные РФ) помечаются excluded=True
    и не попадают в классификацию anomaly_like — через classify_event(event_date=...)."""
    by_day = {}
    for row in sorted(snapshots_rows, key=lambda r: r["snapshot_time"]):
        ts = datetime.fromisoformat(row["snapshot_time"].replace("Z", "+00:00"))
        local_day = ts.astimezone(seller_tz).date()
        by_day[local_day] = row

    pre_period_days = sorted([d for d in by_day if d < period_start])
    abs_deltas_history = []
    prev_stock = None
    prev_snapshot_id = None
    prev_exists = False
    prev_day = None  # день предыдущего РЕАЛЬНОГО снапшота (для нормализации на разрыв)
    if pre_period_days:
        last_pre = pre_period_days[-1]
        prev_stock = int(by_day[last_pre]["stock_quantity"])
        prev_snapshot_id = by_day[last_pre].get("snapshot_id")
        prev_exists = True
        prev_day = last_pre
        prev_for_seed = None
        prev_day_for_seed = None
        for d in pre_period_days:
            s = int(by_day[d]["stock_quantity"])
            if prev_for_seed is not None and prev_day_for_seed is not None:
                delta = s - prev_for_seed
                # Праздники из seed-истории тоже выкидываем
                if delta < 0 and not is_holiday(d):
                    days_gap = max(1, (d - prev_day_for_seed).days)
                    per_day = max(1, int(round(abs(delta) / days_gap)))
                    abs_deltas_history.append(per_day)
            prev_for_seed = s
            prev_day_for_seed = d

    aggregates = []
    event_rows = []

    cur = period_start
    while cur <= period_end:
        if cur in by_day:
            row = by_day[cur]
            stock = int(row["stock_quantity"])
            price = float(row["price"])
            avail = bool(row["availability"])
            raw_delta = (stock - prev_stock) if prev_exists else None
            delta = raw_delta
            # Нормализация дельты после разрыва синка (БАГ 10, in-period путь).
            # Если предыдущий реальный снапшот был days_gap дней назад, падение
            # остатка относится ко всему окну, а не к одному дню. Без деления
            # gap-дельта (а) ложно срабатывает как anomaly против посуточной
            # медианы и (б) раздувает скорость (весь расход за разрыв вешается на
            # один in_stock-день, т.к. дни-пропуски идут MISSING и не попадают в
            # знаменатель). Делим на days_gap — как в pre-period seed выше.
            if raw_delta is not None and raw_delta < 0 and prev_day is not None:
                days_gap = max(1, (cur - prev_day).days)
                if days_gap > 1:
                    delta = -max(1, int(round(abs(raw_delta) / days_gap)))
            median_abs = _median(abs_deltas_history) if abs_deltas_history else None
            # Передаём event_date в classify_event — праздники не классифицируются как anomaly
            et, excluded = classify_event(delta, median_abs, prev_exists, event_date=cur)
            # Добавляем в медиану ТОЛЬКО sales_like и НЕ праздники
            if et == EventType.SALES_LIKE and delta is not None and not is_holiday(cur):
                abs_deltas_history.append(abs(delta))
            aggregates.append(DailyAggregate(
                day=cur, availability=avail, end_of_day_stock=stock, price=price,
                event_type=et, delta_stock=delta, excluded_from_confirmed_metrics=excluded,
            ))
            event_rows.append({
                "product_id": row.get("product_id"),
                "previous_snapshot_id": prev_snapshot_id,
                "current_snapshot_id": row.get("snapshot_id"),
                "event_time": row["snapshot_time"],
                "event_date": cur.isoformat(),
                "delta_stock": delta,
                "event_type": et.value,
                "excluded_from_confirmed_metrics": excluded,
            })
            prev_stock = stock
            prev_snapshot_id = row.get("snapshot_id")
            prev_exists = True
            prev_day = cur
        else:
            aggregates.append(DailyAggregate(
                day=cur, availability=False, end_of_day_stock=prev_stock or 0,
                price=0.0, event_type=EventType.MISSING_DATA,
                delta_stock=None, excluded_from_confirmed_metrics=True,
            ))
        cur = cur + timedelta(days=1)

    # Recount-детекция ОТКЛЮЧЕНА (решение заказчика 22.06.2026): склад снимается
    # раз в день — внутридневные компенсирующие пары (окно 12ч) зафиксировать
    # нельзя, детектор давал бы ложные срабатывания (особенно на мелких SKU) и
    # ошибочно исключал бы продажи. Логика и тесты сохранены в app/engine/recount.py;
    # чтобы вернуть — поставить флаг в True (когда появятся несколько снэпшотов/день).
    _RECOUNT_DETECTION_ENABLED = False
    if _RECOUNT_DETECTION_ENABLED:
        try:
            from app.engine.recount import Snapshot as RcSnap, detect_recount_pairs
            rc_snaps = [
                RcSnap(
                    snapshot_id=r.get("snapshot_id", ""),
                    snapshot_time=datetime.fromisoformat(r["snapshot_time"].replace("Z", "+00:00")),
                    stock_quantity=int(r["stock_quantity"]),
                )
                for r in sorted(snapshots_rows, key=lambda x: x["snapshot_time"])
            ]
            recount_pairs = detect_recount_pairs(rc_snaps)
            if recount_pairs:
                recount_days = set()
                for snap_a, snap_b in recount_pairs:
                    # Оба дня пары: при пересчёте через полночь компенсирующий день
                    # (snap_b) тоже нужно переклассифицировать, иначе он остаётся
                    # sales_like/replenishment_like и искажает скорость.
                    recount_days.add(snap_a.snapshot_time.astimezone(seller_tz).date())
                    recount_days.add(snap_b.snapshot_time.astimezone(seller_tz).date())
                for i, a in enumerate(aggregates):
                    if a.day in recount_days and a.event_type != EventType.MISSING_DATA:
                        aggregates[i] = DailyAggregate(
                            day=a.day, availability=a.availability,
                            end_of_day_stock=a.end_of_day_stock, price=a.price,
                            event_type=EventType.RECOUNT_LIKE,
                            delta_stock=a.delta_stock,
                            excluded_from_confirmed_metrics=True,
                        )
                        for er in event_rows:
                            if er["event_date"] == a.day.isoformat():
                                er["event_type"] = EventType.RECOUNT_LIKE.value
                                er["excluded_from_confirmed_metrics"] = True
        except Exception:
            # Раньше тут был молчаливый pass: любая ошибка детекции пересчётов
            # отключала reclass для ВСЕХ SKU без следа (recount шёл как продажа/
            # аномалия и искажал скорость + lost_revenue). Логируем, не глотаем.
            logger.exception("recount detection failed in build_daily_aggregates")

    return aggregates, event_rows
