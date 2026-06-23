"""Пересчёт метрик селлера."""
from __future__ import annotations

import logging
import re
from datetime import date, datetime, timedelta, timezone
from statistics import median as _median
from typing import Optional

import pytz

from app.db import execute_minimal, fetch_all, get_supabase
from app.engine.alerts import (
    critical_stock_alert, dead_inventory_alert, low_stock_alert, repeated_stockout_alert,
    should_keep_critical_active, should_keep_dead_active,
    should_keep_low_stock_active, should_keep_repeated_stockout_active,
)
from app.engine.health import is_underestimated_sku
from app.engine.pipeline import compute_metrics_for_sku
from app.engine.price import calculate_elasticity, detect_price_changes
from app.schemas import EventType, InventorySegment

# Перенесено в соседние модули 05.06.2026 (инцидент egress, recalc.py перерос
# лимит передачи MCP). Реэкспорт сохраняет старые импорты тестов и кода.
from app.jobs.recalc_aggregates import (  # noqa: F401
    _extract_pre_period_sales_deltas,
    build_daily_aggregates,
)
from app.jobs.recalc_store import (  # noqa: F401
    _compute_aggregates,
    _write_store_metrics,
    _write_warehouse_metrics,
)

logger = logging.getLogger("veloseller.recalc")

_PRODUCT_IN_BATCH = 200
_VERBOSE_FAILURES_PER_RECALC = 3

# Типы событий, считающихся "движением товара" для inactive_sku_count.
# Если за период не было ни одного такого события — SKU считается без активности.
_MOVEMENT_EVENT_TYPES = {EventType.SALES_LIKE.value, EventType.REPLENISHMENT_LIKE.value}


def _resolve_timezone(tz_name: Optional[str]):
    """Безопасно резолвит таймзону селлера в tzinfo.

    Поддерживает IANA-имена (Europe/Moscow), 'UTC', а также формат 'UTC+3' /
    'UTC-5' / 'GMT+5:30', который шлёт UI настроек — pytz его НЕ понимает и кидает
    UnknownTimeZoneError, из-за чего весь recalc селлера падал ещё до загрузки
    товаров. Неизвестное значение → UTC (recalc не должен падать из-за tz).
    """
    name = (tz_name or "UTC").strip()
    try:
        return pytz.timezone(name)
    except Exception:
        pass
    m = re.fullmatch(r"(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?", name, re.IGNORECASE)
    if m:
        sign = 1 if m.group(1) == "+" else -1
        offset_min = sign * (int(m.group(2)) * 60 + int(m.group(3) or 0))
        return pytz.FixedOffset(offset_min)
    logger.warning("неизвестная таймзона селлера, fallback UTC", extra={"tz": name})
    return pytz.UTC


def _seller_timezone(sb, seller_id: str):
    """tzinfo селлера (через _resolve_timezone — терпит UTC±N и мусор)."""
    res = sb.table("sellers").select("timezone").eq("id", seller_id).execute()
    raw = (res.data[0] if res.data else {}).get("timezone")
    return _resolve_timezone(raw)


def _event_message(et: EventType, delta: Optional[int]) -> str:
    if et == EventType.SALES_LIKE:
        return f"Продажа: {abs(delta or 0)} шт."
    if et == EventType.REPLENISHMENT_LIKE:
        return f"Пополнение: +{delta or 0} шт."
    if et == EventType.ANOMALY_LIKE:
        return f"Аномалия: {delta or 0} шт. (резкое снижение)"
    if et == EventType.MISSING_DATA:
        return "Нет данных за день"
    if et == EventType.FIRST_SNAPSHOT:
        return "Первый снимок склада"
    if et == EventType.NO_CHANGE:
        return "Без изменений"
    return str(et.value)


def _confidence_impact(et: EventType) -> float:
    return {
        EventType.REPLENISHMENT_LIKE: -3.33,
        EventType.ANOMALY_LIKE: -3.33,
        EventType.MISSING_DATA: -3.33,
    }.get(et, 0.0)


def _bump_progress(progress: Optional[dict], **fields) -> None:
    if progress is None:
        return
    progress.update(fields)


def _log_failed_sku(phase, seller_id, product_id, period_days, exc, verbose_remaining):
    err_type = type(exc).__name__
    err_msg = str(exc)[:300]
    if verbose_remaining > 0:
        logger.warning(
            "recalc SKU failed: %s: %s [phase=%s pid=%s period=%d]",
            err_type, err_msg, phase, product_id, period_days,
            extra={
                "seller_id": seller_id, "product_id": product_id,
                "phase": phase, "period_days": period_days,
                "error_type": err_type, "error_msg": err_msg,
            }
        )
    else:
        logger.info(
            "recalc SKU failed: %s [phase=%s pid=%s]",
            err_type, phase, product_id,
            extra={
                "seller_id": seller_id, "product_id": product_id,
                "phase": phase, "error_type": err_type,
            }
        )


def _fetch_snapshots_batched(sb, product_ids, history_start):
    if not product_ids:
        return {}
    result = {pid: [] for pid in product_ids}
    for i in range(0, len(product_ids), _PRODUCT_IN_BATCH):
        batch = product_ids[i:i + _PRODUCT_IN_BATCH]
        rows = fetch_all(
            sb.table("inventory_snapshots")
            .select("snapshot_id,product_id,snapshot_time,stock_quantity,price,availability")
            .in_("product_id", batch)
            .gte("snapshot_time", history_start)
        )
        for r in rows:
            pid = r.get("product_id")
            if pid in result:
                result[pid].append(r)
    for pid in result:
        result[pid].sort(key=lambda r: r["snapshot_time"])
    return result


def _write_inventory_events(sb, product_id, event_rows, period_start, period_end):
    if not event_rows:
        return 0
    execute_minimal(
        sb.table("inventory_events").delete().eq("product_id", product_id).gte("event_date", period_start.isoformat()).lte("event_date", period_end.isoformat())
    )
    rows = []
    for r in event_rows:
        if not r.get("current_snapshot_id"):
            continue
        r2 = dict(r)
        r2["product_id"] = product_id
        rows.append(r2)
    if rows:
        execute_minimal(sb.table("inventory_events").insert(rows))
    return len(rows)


def _write_changelog(sb, seller_id, product_id, aggregates, period_start, period_end):
    significant = {EventType.REPLENISHMENT_LIKE, EventType.ANOMALY_LIKE, EventType.MISSING_DATA, EventType.RECOUNT_LIKE}
    # Инцидент 05.06.2026 (DB Size 82%): «Нет данных за день» ДО первого
    # реального снапшота продукта — мусорный хвост 90-дневного периода до
    # подключения склада. 503К таких строк (97% таблицы changelog) съели
    # половину базы. missing_data пишем только с первого дня, где данные были.
    first_data_day = min(
        (a.day for a in aggregates if a.event_type != EventType.MISSING_DATA),
        default=None,
    )
    execute_minimal(
        sb.table("changelog").delete().eq("product_id", product_id).gte("event_date", period_start.isoformat()).lte("event_date", period_end.isoformat())
    )
    rows = []
    for a in aggregates:
        if a.event_type not in significant:
            continue
        if a.event_type == EventType.MISSING_DATA and (
            first_data_day is None or a.day < first_data_day
        ):
            continue
        rows.append({
            "seller_id": seller_id, "product_id": product_id,
            "event_date": a.day.isoformat(),
            "event_type": a.event_type.value, "delta_stock": a.delta_stock,
            "message": _event_message(a.event_type, a.delta_stock),
            "confidence_impact": _confidence_impact(a.event_type),
        })
    if rows:
        execute_minimal(sb.table("changelog").insert(rows))
    return len(rows)


def _upsert_or_skip_alert(sb, seller_id, product_id, kind, message, payload):
    existing = sb.table("alerts").select("id").eq("seller_id", seller_id).eq(
        "product_id", product_id
    ).eq("kind", kind).is_("acknowledged_at", "null").limit(1).execute()
    if existing.data:
        execute_minimal(sb.table("alerts").update({"message": message, "payload": payload}).eq("id", existing.data[0]["id"]))
        return False
    try:
        execute_minimal(sb.table("alerts").insert({
            "seller_id": seller_id, "product_id": product_id,
            "kind": kind, "message": message, "payload": payload,
        }))
        return True
    except Exception as e:
        err_str = str(e).lower()
        if "duplicate" in err_str or "unique" in err_str or "23505" in err_str:
            existing2 = sb.table("alerts").select("id").eq("seller_id", seller_id).eq(
                "product_id", product_id
            ).eq("kind", kind).is_("acknowledged_at", "null").limit(1).execute()
            if existing2.data:
                execute_minimal(sb.table("alerts").update({"message": message, "payload": payload}).eq("id", existing2.data[0]["id"]))
            return False
        raise


_HYSTERESIS_KEEP_CHECKS = {
    "low_stock":         lambda m: should_keep_low_stock_active(m.coverage_days),
    "critical_stock":    lambda m: should_keep_critical_active(m.coverage_days),
    "dead_inventory":    lambda m: should_keep_dead_active(m.coverage_days) or m.segment == InventorySegment.DEAD_INVENTORY_RISK,
    "repeated_stockout": lambda m: should_keep_repeated_stockout_active(m.stockout_days),
}


# Порог свежести данных (дней). Если последний снапшот старше относительно конца
# окна — синк застрял, current_stock устарел, low/critical-алерты по нему ложны.
_STALE_DATA_DAYS = 7


def _write_alerts(sb, seller_id, product_id, m, underestimated, data_stale=False):
    cov = m.coverage_days
    desired_alerts = []
    # data_stale: последний снапшот устарел (синк застрял) → current_stock и
    # coverage_days ненадёжны. НЕ открываем новые low/critical «пора заказывать»
    # на устаревшем остатке (ложная тревога); уже открытые держит гистерезис.
    # dead/repeated_stockout/underestimated историчны — к свежести не так чувствительны.
    if not data_stale and critical_stock_alert(cov):
        desired_alerts.append(("critical_stock", f"Coverage {cov:.1f} дн — критически мало"))
    elif not data_stale and low_stock_alert(cov):
        desired_alerts.append(("low_stock", f"Coverage {cov:.1f} дн — мало"))
    if dead_inventory_alert(cov) or m.segment == InventorySegment.DEAD_INVENTORY_RISK:
        dead_msg = (
            f"Coverage {cov:.0f} дн — заморожен" if cov is not None
            else f"Нет продаж при остатке {m.current_stock} — заморожен"
        )
        desired_alerts.append(("dead_inventory", dead_msg))
    if repeated_stockout_alert(m.stockout_days):
        desired_alerts.append(("repeated_stockout", f"{m.stockout_days} дней OOS за период"))
    if underestimated:
        desired_alerts.append(("underestimated_sku", "Скорость SKU выше медианы при out-of-stock — недополучаете выручку"))

    desired_kinds = {k for k, _ in desired_alerts}
    payload = {"coverage_days": cov, "stockout_days": m.stockout_days}

    existing_active = sb.table("alerts").select("id,kind").eq(
        "seller_id", seller_id
    ).eq("product_id", product_id).is_("acknowledged_at", "null").execute()
    for row in (existing_active.data or []):
        kind = row["kind"]
        if kind in desired_kinds:
            continue
        keep_fn = _HYSTERESIS_KEEP_CHECKS.get(kind)
        if keep_fn is not None and keep_fn(m):
            continue
        execute_minimal(sb.table("alerts").update({
            "acknowledged_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", row["id"]))

    new_count = 0
    for kind, msg in desired_alerts:
        if _upsert_or_skip_alert(sb, seller_id, product_id, kind, msg, payload):
            new_count += 1
    return new_count


def recalc_seller(seller_id, period_days=30, progress=None):
    sb = get_supabase()
    seller_tz = _seller_timezone(sb, seller_id)
    # Граница периода — в TZ селлера. Worker обычно крутится в UTC, и date.today()
    # на UTC-хосте отличается на день от локального календаря селлера → сдвигает
    # всё окно 7/30/90 и выбор «текущего» снапшота. Остальные даты в функции уже
    # приводятся к seller_tz, граница тоже должна.
    period_end = datetime.now(seller_tz).date()
    period_start = period_end - timedelta(days=period_days - 1)

    _bump_progress(progress, phase="loading_products", period_days=period_days, processed=0, total=0)

    # ПРАВКА 10 этап 2 (25.05.2026): connection_id нужен для warehouse_metrics
    # (per-warehouse history графиков). Без него не можем сгруппировать
    # sku_data по складам.
    products = fetch_all(
        sb.table("products").select("product_id,sku,connection_id").eq("seller_id", seller_id)
    )
    if not products:
        _bump_progress(progress, phase="done")
        return {"products": 0, "metrics_written": 0, "alerts_written": 0,
                "store_metrics_written": 0, "warehouse_metrics_written": 0,
                "failed_skus": 0,
                "events_written": 0, "changelog_written": 0}

    total_skus = len(products)
    history_start = (period_start - timedelta(days=30)).isoformat()

    _bump_progress(progress, phase="fetching_snapshots", total=total_skus, processed=0)
    all_pids = [p["product_id"] for p in products]
    snapshots_by_pid = _fetch_snapshots_batched(sb, all_pids, history_start)

    # ПРАВКА 10 этап 2: маппинг product_id → connection_id, чтобы добавить
    # в sku_data. Из products уже выбран connection_id; легаси-продукты
    # без connection_id получают None и не попадают в warehouse_metrics
    # (только в store_metrics).
    connection_by_pid = {p["product_id"]: p.get("connection_id") for p in products}

    logger.info("recalc batched fetch done", extra={
        "seller_id": seller_id, "period_days": period_days,
        "products": total_skus,
        "snapshots_total": sum(len(v) for v in snapshots_by_pid.values()),
        "history_start": history_start,
    })

    _bump_progress(progress, phase="processing_skus", processed=0)

    metrics_written = 0
    alerts_written = 0
    events_written = 0
    changelog_written = 0
    failed_skus = 0
    sku_data = []
    velocities_for_median = []

    verbose_failures_left = _VERBOSE_FAILURES_PER_RECALC

    for idx, p in enumerate(products):
        pid = p["product_id"]
        try:
            rows = snapshots_by_pid.get(pid, [])
            if (idx + 1) % 50 == 0 or idx == total_skus - 1:
                _bump_progress(progress, processed=idx + 1)
            if not rows:
                continue

            pre_period_history = _extract_pre_period_sales_deltas(rows, period_start, seller_tz)
            aggregates, event_rows = build_daily_aggregates(rows, period_start, period_end, seller_tz)
            current_stock = int(rows[-1]["stock_quantity"] or 0)
            current_price = float(rows[-1]["price"] or 0)

            # Свежесть данных: насколько последний снапшот отстаёт от конца окна
            # (period_end = сегодня, см. recalc_seller). Застрявший синк → last_ts
            # сильно в прошлом → current_stock устарел → подавляем stock-алерты.
            data_stale = False
            last_ts = rows[-1].get("snapshot_time")
            if last_ts:
                try:
                    last_date = datetime.fromisoformat(str(last_ts).replace("Z", "+00:00")).date()
                    data_stale = (period_end - last_date).days > _STALE_DATA_DAYS
                except (ValueError, TypeError):
                    data_stale = False

            history_arg = pre_period_history if pre_period_history else None
            metric = compute_metrics_for_sku(
                product_id=pid, period_start=period_start, period_end=period_end,
                daily_aggregates=aggregates, current_stock=current_stock,
                history_for_median=history_arg,
            )

            events_written += _write_inventory_events(sb, pid, event_rows, period_start, period_end)
            changelog_written += _write_changelog(sb, seller_id, pid, aggregates, period_start, period_end)

            # Для inactive_sku_count: было ли движение (sales/replenishment) за период?
            # Если SKU ни разу не продавался и не пополнялся — считаем неактивным.
            has_movements = any(
                er.get("event_type") in _MOVEMENT_EVENT_TYPES
                for er in event_rows
            )

            daily_prices = [(a.day, a.price) for a in aggregates if a.price > 0]
            price_changes = detect_price_changes(daily_prices)
            if price_changes:
                price_rows = [
                    {
                        "product_id": pid, "seller_id": seller_id,
                        "event_date": pc.day.isoformat(),
                        # Изменение цены — отдельный тип, а не пересчёт склада
                        # (раньше писалось recount_like и засоряло класс пересчётов).
                        "event_type": "price_change", "delta_stock": None,
                        "message": f"Цена изменилась: {pc.previous_price:.2f} → {pc.new_price:.2f} ({pc.delta_pct:+.1f}%)",
                        "confidence_impact": 0.0,
                    }
                    for pc in price_changes
                ]
                execute_minimal(sb.table("changelog").insert(price_rows))
                changelog_written += len(price_rows)

                for pc in price_changes:
                    sales_before = [
                        abs(a.delta_stock or 0) for a in aggregates
                        if a.day < pc.day and a.availability
                        and a.event_type.value == "sales_like"
                        and a.delta_stock is not None
                    ]
                    sales_after = [
                        abs(a.delta_stock or 0) for a in aggregates
                        if a.day > pc.day and a.availability
                        and a.event_type.value == "sales_like"
                        and a.delta_stock is not None
                    ]
                    sig = calculate_elasticity(pc, sales_before, sales_after)
                    if sig is not None:
                        try:
                            execute_minimal(sb.table("price_elasticity").upsert({
                                "product_id": pid, "seller_id": seller_id,
                                "change_date": pc.day.isoformat(),
                                "previous_price": float(pc.previous_price),
                                "new_price": float(pc.new_price),
                                "price_delta_pct": float(pc.delta_pct),
                                "velocity_before": float(sig.velocity_before),
                                "velocity_after": float(sig.velocity_after),
                                "price_impact_percent": float(sig.price_impact_percent),
                                "days_before": sig.days_before,
                                "days_after": sig.days_after,
                            }, on_conflict="product_id,change_date"))
                        except Exception as e:
                            logger.warning("elasticity write failed for %s: %s", pid, e)

            sku_data.append({
                "pid": pid, "metric": metric, "current_stock": current_stock,
                "current_price": current_price, "availability_now": current_stock > 0,
                "aggregates": aggregates,
                "has_movements": has_movements,
                # ПРАВКА 10 этап 2: connection_id для группировки в warehouse_metrics.
                # None для легаси-продуктов без привязки к складу.
                "connection_id": connection_by_pid.get(pid),
            })
            if metric.adjusted_velocity > 0:
                velocities_for_median.append(metric.adjusted_velocity)
        except Exception as e:
            failed_skus += 1
            _log_failed_sku("loop1_compute", seller_id, pid, period_days, e, verbose_failures_left)
            if verbose_failures_left > 0:
                verbose_failures_left -= 1
            continue

    if failed_skus > 0:
        logger.warning("recalc Loop 1 finished with failures", extra={
            "seller_id": seller_id, "period_days": period_days,
            "failed_skus": failed_skus, "total_skus": total_skus,
            "sku_data_size": len(sku_data),
        })

    median_store_velocity = _median(velocities_for_median) if velocities_for_median else 0.0

    verbose_failures_left_l2 = _VERBOSE_FAILURES_PER_RECALC
    loop2_failures = 0

    _bump_progress(progress, phase="writing_metrics", processed=0, total=len(sku_data))
    for idx, item in enumerate(sku_data):
        pid = item["pid"]
        m = item["metric"]
        try:
            has_enough_history = (
                m.confidence_breakdown.low_history == 0.0
                if m.confidence_breakdown else True
            )
            underestimated = (
                is_underestimated_sku(
                    stockout_days=m.stockout_days,
                    adjusted_velocity=m.adjusted_velocity,
                    median_store_velocity=median_store_velocity,
                    confidence_score=m.confidence_score,
                )
                and has_enough_history
                and m.stockout_days >= 2
            )
            execute_minimal(sb.table("tvelo_metrics").upsert({
                "product_id": pid,
                "period_start": m.period_start.isoformat(),
                "period_end": m.period_end.isoformat(),
                "confirmed_velocity": float(m.confirmed_velocity),
                "adjusted_velocity": float(m.adjusted_velocity),
                "median_30d_velocity": float(m.median_30d_velocity),
                "confidence_score": float(m.confidence_score),
                "confidence_breakdown": m.confidence_breakdown.model_dump() if m.confidence_breakdown else {},
                "stockout_days": m.stockout_days,
                "in_stock_days": m.in_stock_days,
                "coverage_days": float(m.coverage_days) if m.coverage_days is not None else None,
                "current_stock": m.current_stock,
                "current_price": item["current_price"],
                "inventory_segment": m.segment.value if m.segment else None,
                "sku_health_score": float(m.sku_health_score) if m.sku_health_score is not None else None,
                "underestimated_sku": underestimated,
            }, on_conflict="product_id,period_start,period_end"))
            metrics_written += 1
            alerts_written += _write_alerts(sb, seller_id, pid, m, underestimated, data_stale=data_stale)
        except Exception as e:
            failed_skus += 1
            loop2_failures += 1
            _log_failed_sku("loop2_write", seller_id, pid, period_days, e, verbose_failures_left_l2)
            if verbose_failures_left_l2 > 0:
                verbose_failures_left_l2 -= 1
        if (idx + 1) % 50 == 0 or idx == len(sku_data) - 1:
            _bump_progress(progress, processed=idx + 1)

    if loop2_failures > 0:
        logger.warning("recalc Loop 2 finished with failures", extra={
            "seller_id": seller_id, "period_days": period_days,
            "loop2_failures": loop2_failures, "metrics_written": metrics_written,
        })

    _bump_progress(progress, phase="writing_store")
    try:
        store_written = _write_store_metrics(sb, seller_id, sku_data, period_start, period_end)
    except Exception:
        logger.exception("store_metrics write failed", extra={"seller_id": seller_id})
        store_written = 0

    # ПРАВКА 10 этап 2: warehouse_metrics — per-warehouse история для графиков
    # динамики /dashboard. Пишется ДОПОЛНИТЕЛЬНО к store_metrics.
    _bump_progress(progress, phase="writing_warehouse")
    try:
        warehouse_written = _write_warehouse_metrics(sb, seller_id, sku_data, period_start, period_end)
    except Exception:
        logger.exception("warehouse_metrics write failed", extra={"seller_id": seller_id})
        warehouse_written = 0

    return {
        "products": len(products),
        "failed_skus": failed_skus,
        "metrics_written": metrics_written,
        "alerts_written": alerts_written,
        "events_written": events_written,
        "changelog_written": changelog_written,
        "store_metrics_written": store_written,
        "warehouse_metrics_written": warehouse_written,
    }


def recalc_seller_all_periods(seller_id, progress=None):
    result = {"products": 0, "metrics_written": 0, "alerts_written": 0,
              "store_metrics_written": 0, "warehouse_metrics_written": 0,
              "events_written": 0, "changelog_written": 0,
              "failed_skus": 0, "periods": []}
    periods_list = (7, 30, 90)
    _bump_progress(progress, total_periods=len(periods_list), current_period_index=0)
    for i, period_days in enumerate(periods_list):
        _bump_progress(progress, current_period_index=i + 1)
        try:
            r = recalc_seller(seller_id, period_days=period_days, progress=progress)
        except Exception:
            logger.exception("recalc_seller failed for period", extra={
                "seller_id": seller_id, "period_days": period_days,
            })
            r = {"products": 0, "failed_skus": 0, "metrics_written": 0, "alerts_written": 0,
                 "events_written": 0, "changelog_written": 0, "store_metrics_written": 0,
                 "warehouse_metrics_written": 0, "error": "period failed"}
        result["periods"].append({"period_days": period_days, **r})
        if period_days == 30:
            for k in ("products", "metrics_written", "alerts_written",
                      "store_metrics_written", "warehouse_metrics_written",
                      "events_written", "changelog_written",
                      "failed_skus"):
                result[k] = r.get(k, 0)
    _bump_progress(progress, phase="done")
    return result


def recalc_all_sellers():
    """БАГ 32: пагинация. БАГ 50/конкурентность: берём ОБЩИЙ БД-лок (тот же, что
    ручной recalc через HTTP) — чтобы на нескольких репликах один селлер не
    считался дважды и не дрался за event-таблицы. Раньше проверялся только
    in-process dict _running_recalcs, который не виден другим репликам/процессам,
    поэтому ночной cron мог идти параллельно ручному recalc на другой реплике."""
    sb = get_supabase()
    sellers = fetch_all(sb.table("sellers").select("id"))
    summary = {"sellers": 0, "skipped_concurrent": 0, "metrics_written": 0,
               "alerts_written": 0, "store_metrics_written": 0,
               "warehouse_metrics_written": 0, "failed_skus": 0}

    # Лок-хелперы живут в main.py (единый путь с ручным recalc). Ленивый импорт:
    # main импортирует jobs.recalc, прямой импорт наверху дал бы цикл.
    try:
        from app.main import (
            _try_acquire_recalc_lock as _acquire,
            _mark_recalc_done as _mark_done,
            _mark_recalc_error as _mark_error,
        )
    except ImportError:
        _acquire = _mark_done = _mark_error = None

    for s in sellers:
        seller_id = s["id"]
        if _acquire is not None and not _acquire(seller_id):
            summary["skipped_concurrent"] += 1
            logger.info("recalc-all: skip seller (recalc уже идёт / лок занят)",
                        extra={"seller_id": seller_id})
            continue
        try:
            r = recalc_seller_all_periods(seller_id)
            if _mark_done is not None:
                _mark_done(seller_id, r)
            summary["sellers"] += 1
            summary["metrics_written"] += r.get("metrics_written", 0)
            summary["alerts_written"] += r.get("alerts_written", 0)
            summary["store_metrics_written"] += r.get("store_metrics_written", 0)
            summary["warehouse_metrics_written"] += r.get("warehouse_metrics_written", 0)
            summary["failed_skus"] += r.get("failed_skus", 0)
        except Exception as e:
            if _mark_error is not None:
                _mark_error(seller_id, str(e)[:500])
            logger.exception("recalc failed for seller %s: %s", seller_id, e)
    return summary


# ─── Бэкдейт-пересчёт истории метрик (для графиков Динамики) ──────────────────

def _fetch_snapshots_asof(sb, product_ids, history_start, as_of_cutoff):
    """Как _fetch_snapshots_batched, но с верхней границей: только снапшоты
    РАНЬШЕ as_of_cutoff (начало дня, следующего за as_of). Нужно, чтобы
    бэкдейт-пересчёт не «подглядывал» в будущее относительно as_of."""
    if not product_ids:
        return {}
    result = {pid: [] for pid in product_ids}
    for i in range(0, len(product_ids), _PRODUCT_IN_BATCH):
        batch = product_ids[i:i + _PRODUCT_IN_BATCH]
        rows = fetch_all(
            sb.table("inventory_snapshots")
            .select("snapshot_id,product_id,snapshot_time,stock_quantity,price,availability")
            .in_("product_id", batch)
            .gte("snapshot_time", history_start)
            .lt("snapshot_time", as_of_cutoff)
        )
        for r in rows:
            pid = r.get("product_id")
            if pid in result:
                result[pid].append(r)
    for pid in result:
        result[pid].sort(key=lambda r: r["snapshot_time"])
    return result


def recalc_seller_asof(seller_id, as_of, period_days=30):
    """Бэкдейт-пересчёт: метрики SKU ПО СОСТОЯНИЮ на дату as_of.

    Зачем: графики Динамики (/dashboard/dynamics) строятся по временно́му ряду
    tvelo_metrics (точка = period_end). После миграции ряд короткий (метрики
    пишутся только вперёд), поэтому Динамика пустая. Эта функция наполняет ряд
    задним числом по уже имеющимся снапшотам.

    Отличия от recalc_seller:
    - period_end = as_of (не today);
    - снапшоты берутся только до конца as_of (не подглядываем в будущее);
    - пишем ТОЛЬКО tvelo_metrics (батч-upsert). НЕ трогаем alerts / changelog /
      inventory_events / price_elasticity / store_metrics / warehouse_metrics:
      это исторические точки для графика — плодить алерты и события задним числом
      нельзя, а store/warehouse-агрегаты не date-scoped, их перетирать опасно.
    """
    sb = get_supabase()
    period_end = as_of
    period_start = period_end - timedelta(days=period_days - 1)
    seller_tz = _seller_timezone(sb, seller_id)

    products = fetch_all(
        sb.table("products").select("product_id,sku,connection_id").eq("seller_id", seller_id)
    )
    if not products:
        return {"as_of": as_of.isoformat(), "period_days": period_days,
                "products": 0, "metrics_written": 0, "failed_skus": 0}

    history_start = (period_start - timedelta(days=30)).isoformat()
    as_of_cutoff = (as_of + timedelta(days=1)).isoformat()
    all_pids = [p["product_id"] for p in products]
    snapshots_by_pid = _fetch_snapshots_asof(sb, all_pids, history_start, as_of_cutoff)

    sku_data = []
    velocities_for_median = []
    failed = 0
    for p in products:
        pid = p["product_id"]
        try:
            rows = snapshots_by_pid.get(pid, [])
            if not rows:
                continue
            pre_period_history = _extract_pre_period_sales_deltas(rows, period_start, seller_tz)
            aggregates, _event_rows = build_daily_aggregates(rows, period_start, period_end, seller_tz)
            current_stock = int(rows[-1]["stock_quantity"] or 0)
            current_price = float(rows[-1]["price"] or 0)
            history_arg = pre_period_history if pre_period_history else None
            metric = compute_metrics_for_sku(
                product_id=pid, period_start=period_start, period_end=period_end,
                daily_aggregates=aggregates, current_stock=current_stock,
                history_for_median=history_arg,
            )
            sku_data.append({"pid": pid, "metric": metric, "current_price": current_price})
            if metric.adjusted_velocity > 0:
                velocities_for_median.append(metric.adjusted_velocity)
        except Exception as e:
            failed += 1
            logger.warning("backfill: SKU пропущен pid=%s: %s", pid, e)
            continue

    median_store_velocity = _median(velocities_for_median) if velocities_for_median else 0.0

    upsert_rows = []
    for item in sku_data:
        m = item["metric"]
        has_enough_history = (
            m.confidence_breakdown.low_history == 0.0 if m.confidence_breakdown else True
        )
        underestimated = (
            is_underestimated_sku(
                stockout_days=m.stockout_days,
                adjusted_velocity=m.adjusted_velocity,
                median_store_velocity=median_store_velocity,
                confidence_score=m.confidence_score,
            )
            and has_enough_history
            and m.stockout_days >= 2
        )
        upsert_rows.append({
            "product_id": item["pid"],
            "period_start": m.period_start.isoformat(),
            "period_end": m.period_end.isoformat(),
            "confirmed_velocity": float(m.confirmed_velocity),
            "adjusted_velocity": float(m.adjusted_velocity),
            "median_30d_velocity": float(m.median_30d_velocity),
            "confidence_score": float(m.confidence_score),
            "confidence_breakdown": m.confidence_breakdown.model_dump() if m.confidence_breakdown else {},
            "stockout_days": m.stockout_days,
            "in_stock_days": m.in_stock_days,
            "coverage_days": float(m.coverage_days) if m.coverage_days is not None else None,
            "current_stock": m.current_stock,
            "current_price": item["current_price"],
            "inventory_segment": m.segment.value if m.segment else None,
            "sku_health_score": float(m.sku_health_score) if m.sku_health_score is not None else None,
            "underestimated_sku": underestimated,
        })

    metrics_written = 0
    _CHUNK = 500
    for i in range(0, len(upsert_rows), _CHUNK):
        chunk = upsert_rows[i:i + _CHUNK]
        try:
            execute_minimal(
                sb.table("tvelo_metrics").upsert(chunk, on_conflict="product_id,period_start,period_end")
            )
            metrics_written += len(chunk)
        except Exception:
            logger.exception("asof bulk upsert failed", extra={
                "seller_id": seller_id, "as_of": as_of.isoformat(),
                "period_days": period_days, "chunk_start": i,
            })
            failed += len(chunk)

    return {"as_of": as_of.isoformat(), "period_days": period_days,
            "products": len(products), "metrics_written": metrics_written,
            "failed_skus": failed}


def run_history_backfill(days_back=90, periods=(7, 30, 90), only_seller=None):
    """Прогон бэкдейт-пересчёта на days_back дней назад (включая сегодня).

    Для каждой даты as_of и каждого периода пишет точку tvelo_metrics — так
    наполняется временной ряд для графиков Динамики. Идём от старых дат к новым.
    Старт авто-клампится к дате первого снапшота: дни раньше неё ничего не пишут
    (продукты без снапшотов пропускаются), поэтому days_back можно ставить с
    запасом — лишние ранние дни просто пропустятся.
    """
    sb = get_supabase()
    today = date.today()
    sellers = ([{"id": only_seller}] if only_seller
               else fetch_all(sb.table("sellers").select("id")))
    summary = {"days_back": days_back, "sellers": len(sellers),
               "points_written": 0, "days_done": 0, "errors": 0}

    start_day = today - timedelta(days=days_back - 1)
    # Авто-кламп старта к первому снапшоту — чтобы не гонять пустые ранние дни.
    try:
        e = (sb.table("inventory_snapshots").select("snapshot_time")
             .order("snapshot_time").limit(1).execute())
        if e.data:
            earliest = datetime.fromisoformat(
                str(e.data[0]["snapshot_time"]).replace("Z", "+00:00")
            ).date()
            if earliest > start_day:
                start_day = earliest
    except Exception:
        logger.exception("backfill: не удалось определить первый снапшот, идём по days_back")

    d = start_day
    while d <= today:
        day_points = 0
        for s in sellers:
            sid = s["id"]
            for pdays in periods:
                try:
                    r = recalc_seller_asof(sid, as_of=d, period_days=pdays)
                    day_points += r.get("metrics_written", 0)
                except Exception:
                    summary["errors"] += 1
                    logger.exception("backfill asof failed", extra={
                        "seller_id": sid, "as_of": d.isoformat(), "period_days": pdays,
                    })
        summary["points_written"] += day_points
        summary["days_done"] += 1
        logger.info("backfill day done", extra={"as_of": d.isoformat(), "points": day_points})
        d += timedelta(days=1)

    logger.info("backfill complete", extra=summary)
    return summary
