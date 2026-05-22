"""Пересчёт метрик селлера."""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from statistics import median as _median
from typing import Optional

import pytz

from app.db import fetch_all, get_supabase
from app.engine.alerts import (
    critical_stock_alert, dead_inventory_alert, low_stock_alert, repeated_stockout_alert,
    should_keep_critical_active, should_keep_dead_active,
    should_keep_low_stock_active, should_keep_repeated_stockout_active,
)
from app.engine.events import classify_event
from app.engine.health import is_underestimated_sku
from app.engine.lost_revenue import average_stockout_price
from app.engine.pipeline import DailyAggregate, compute_metrics_for_sku
from app.engine.price import calculate_elasticity, detect_price_changes
from app.engine.store import (
    SkuHealthInput, SkuValue, concentration_50, demand_weight,
    frozen_inventory_value, total_inventory_value, warehouse_health_score,
)
from app.holidays import is_holiday
from app.schemas import EventType, TVeloMetric

logger = logging.getLogger("veloseller.recalc")

_PRODUCT_IN_BATCH = 200
_VERBOSE_FAILURES_PER_RECALC = 3

# Типы событий, считающихся "движением товара" для inactive_sku_count.
# Если за период не было ни одного такого события — SKU считается без активности.
_MOVEMENT_EVENT_TYPES = {EventType.SALES_LIKE.value, EventType.REPLENISHMENT_LIKE.value}


def _seller_timezone(sb, seller_id: str) -> str:
    res = sb.table("sellers").select("timezone").eq("id", seller_id).execute()
    return (res.data[0] if res.data else {}).get("timezone") or "UTC"


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
    if pre_period_days:
        last_pre = pre_period_days[-1]
        prev_stock = int(by_day[last_pre]["stock_quantity"])
        prev_snapshot_id = by_day[last_pre].get("snapshot_id")
        prev_exists = True
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
            delta = (stock - prev_stock) if prev_exists else None
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
        else:
            aggregates.append(DailyAggregate(
                day=cur, availability=False, end_of_day_stock=prev_stock or 0,
                price=0.0, event_type=EventType.MISSING_DATA,
                delta_stock=None, excluded_from_confirmed_metrics=True,
            ))
        cur = cur + timedelta(days=1)

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
                recount_days.add(snap_a.snapshot_time.astimezone(seller_tz).date())
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
        pass

    return aggregates, event_rows


def _write_inventory_events(sb, product_id, event_rows, period_start, period_end):
    if not event_rows:
        return 0
    sb.table("inventory_events").delete().eq("product_id", product_id).gte("event_date", period_start.isoformat()).lte("event_date", period_end.isoformat()).execute()
    rows = []
    for r in event_rows:
        if not r.get("current_snapshot_id"):
            continue
        r2 = dict(r)
        r2["product_id"] = product_id
        rows.append(r2)
    if rows:
        sb.table("inventory_events").insert(rows).execute()
    return len(rows)


def _write_changelog(sb, seller_id, product_id, aggregates, period_start, period_end):
    significant = {EventType.REPLENISHMENT_LIKE, EventType.ANOMALY_LIKE, EventType.MISSING_DATA, EventType.RECOUNT_LIKE}
    sb.table("changelog").delete().eq("product_id", product_id).gte("event_date", period_start.isoformat()).lte("event_date", period_end.isoformat()).execute()
    rows = []
    for a in aggregates:
        if a.event_type not in significant:
            continue
        rows.append({
            "seller_id": seller_id, "product_id": product_id,
            "event_date": a.day.isoformat(),
            "event_type": a.event_type.value, "delta_stock": a.delta_stock,
            "message": _event_message(a.event_type, a.delta_stock),
            "confidence_impact": _confidence_impact(a.event_type),
        })
    if rows:
        sb.table("changelog").insert(rows).execute()
    return len(rows)


def _upsert_or_skip_alert(sb, seller_id, product_id, kind, message, payload):
    existing = sb.table("alerts").select("id").eq("seller_id", seller_id).eq(
        "product_id", product_id
    ).eq("kind", kind).is_("acknowledged_at", "null").limit(1).execute()
    if existing.data:
        sb.table("alerts").update({"message": message, "payload": payload}).eq("id", existing.data[0]["id"]).execute()
        return False
    try:
        sb.table("alerts").insert({
            "seller_id": seller_id, "product_id": product_id,
            "kind": kind, "message": message, "payload": payload,
        }).execute()
        return True
    except Exception as e:
        err_str = str(e).lower()
        if "duplicate" in err_str or "unique" in err_str or "23505" in err_str:
            existing2 = sb.table("alerts").select("id").eq("seller_id", seller_id).eq(
                "product_id", product_id
            ).eq("kind", kind).is_("acknowledged_at", "null").limit(1).execute()
            if existing2.data:
                sb.table("alerts").update({"message": message, "payload": payload}).eq("id", existing2.data[0]["id"]).execute()
            return False
        raise


_HYSTERESIS_KEEP_CHECKS = {
    "low_stock":         lambda m: should_keep_low_stock_active(m.coverage_days),
    "critical_stock":    lambda m: should_keep_critical_active(m.coverage_days),
    "dead_inventory":    lambda m: should_keep_dead_active(m.coverage_days),
    "repeated_stockout": lambda m: should_keep_repeated_stockout_active(m.stockout_days),
}


def _write_alerts(sb, seller_id, product_id, m, underestimated):
    cov = m.coverage_days
    desired_alerts = []
    if critical_stock_alert(cov):
        desired_alerts.append(("critical_stock", f"Coverage {cov:.1f} дн — критически мало"))
    elif low_stock_alert(cov):
        desired_alerts.append(("low_stock", f"Coverage {cov:.1f} дн — мало"))
    if dead_inventory_alert(cov):
        desired_alerts.append(("dead_inventory", f"Coverage {cov:.0f} дн — заморожен"))
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
        sb.table("alerts").update({
            "acknowledged_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", row["id"]).execute()

    new_count = 0
    for kind, msg in desired_alerts:
        if _upsert_or_skip_alert(sb, seller_id, product_id, kind, msg, payload):
            new_count += 1
    return new_count


def recalc_seller(seller_id, period_days=30, progress=None):
    sb = get_supabase()
    period_end = date.today()
    period_start = period_end - timedelta(days=period_days - 1)
    seller_tz = pytz.timezone(_seller_timezone(sb, seller_id))

    _bump_progress(progress, phase="loading_products", period_days=period_days, processed=0, total=0)

    products = fetch_all(
        sb.table("products").select("product_id,sku").eq("seller_id", seller_id)
    )
    if not products:
        _bump_progress(progress, phase="done")
        return {"products": 0, "metrics_written": 0, "alerts_written": 0,
                "store_metrics_written": 0, "failed_skus": 0,
                "events_written": 0, "changelog_written": 0}

    total_skus = len(products)
    history_start = (period_start - timedelta(days=30)).isoformat()

    _bump_progress(progress, phase="fetching_snapshots", total=total_skus, processed=0)
    all_pids = [p["product_id"] for p in products]
    snapshots_by_pid = _fetch_snapshots_batched(sb, all_pids, history_start)
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
            current_stock = int(rows[-1]["stock_quantity"])
            current_price = float(rows[-1]["price"])

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
                        "event_type": "recount_like", "delta_stock": None,
                        "message": f"Цена изменилась: {pc.previous_price:.2f} → {pc.new_price:.2f} ({pc.delta_pct:+.1f}%)",
                        "confidence_impact": 0.0,
                    }
                    for pc in price_changes
                ]
                sb.table("changelog").insert(price_rows).execute()
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
                            sb.table("price_elasticity").upsert({
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
                            }, on_conflict="product_id,change_date").execute()
                        except Exception as e:
                            logger.warning("elasticity write failed for %s: %s", pid, e)

            sku_data.append({
                "pid": pid, "metric": metric, "current_stock": current_stock,
                "current_price": current_price, "availability_now": current_stock > 0,
                "aggregates": aggregates,
                "has_movements": has_movements,
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
            sb.table("tvelo_metrics").upsert({
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
            }, on_conflict="product_id,period_start,period_end").execute()
            metrics_written += 1
            alerts_written += _write_alerts(sb, seller_id, pid, m, underestimated)
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

    return {
        "products": len(products),
        "failed_skus": failed_skus,
        "metrics_written": metrics_written,
        "alerts_written": alerts_written,
        "events_written": events_written,
        "changelog_written": changelog_written,
        "store_metrics_written": store_written,
    }


def _write_store_metrics(sb, seller_id, sku_data, period_start, period_end):
    if not sku_data:
        return 0
    sku_health_inputs = [
        SkuHealthInput(
            product_id=item["pid"],
            health_score=item["metric"].sku_health_score or 0,
            stock_quantity=item["current_stock"],
            price=item["current_price"],
            adjusted_velocity=item["metric"].adjusted_velocity,
            median_30d_velocity=item["metric"].median_30d_velocity,
            is_out_of_stock=not item["availability_now"],
        )
        for item in sku_data
    ]
    inv_items = [SkuValue(s.product_id, s.stock_quantity * s.price) for s in sku_health_inputs]
    dem_items = [
        SkuValue(s.product_id, demand_weight(s.adjusted_velocity, s.median_30d_velocity, s.price))
        for s in sku_health_inputs
    ]
    inv_conc = concentration_50(inv_items)
    dem_conc = concentration_50(dem_items)
    coverage_by_sku = {item["pid"]: item["metric"].coverage_days for item in sku_data}
    total_value = total_inventory_value(sku_health_inputs)
    frozen_value = frozen_inventory_value(sku_health_inputs, coverage_by_sku)
    wh_score = warehouse_health_score(sku_health_inputs)
    seg_distribution = {}
    for item in sku_data:
        seg = (item["metric"].segment.value if item["metric"].segment else "insufficient_data")
        seg_distribution[seg] = seg_distribution.get(seg, 0) + 1
    oos_count = sum(1 for item in sku_data if not item["availability_now"])
    low_count = sum(
        1 for item in sku_data
        if item["metric"].coverage_days is not None and item["metric"].coverage_days <= 7
    )
    dead_count = sum(
        1 for item in sku_data
        if item["metric"].coverage_days is not None and item["metric"].coverage_days > 180
    )

    # Правки 4 (Александр):
    # inactive_sku_count — SKU с нулевым остатком И без движений за период.
    # Эти SKU сняты с продажи (или ещё не продавались) и в остальных метриках
    # участвовать не должны. На фронте они скрываются по умолчанию.
    inactive_count = sum(
        1 for item in sku_data
        if not item["availability_now"] and not item.get("has_movements", True)
    )

    # frequently_oos_sku_count — SKU где stockout_days > 15 за период (более
    # 15 дней out-of-stock за месяц). Сигнал систематической проблемы.
    frequently_oos_count = sum(
        1 for item in sku_data
        if item["metric"].stockout_days > 15
    )

    # Правка 2 Александра: "Нет в наличии" должно быть = товары с нулевым остатком,
    # ПО КОТОРЫМ БЫЛО ДВИЖЕНИЕ за 30 дней. То есть из oos_count вычитаем inactive.
    # Это даёт активный OOS — то, чем реально надо заниматься.
    active_oos_count = max(0, oos_count - inactive_count)

    lost_total = 0.0
    for item in sku_data:
        m = item["metric"]
        if m.adjusted_velocity <= 0 or m.stockout_days <= 0:
            continue
        prices_during_stockout = [
            a.price for a in item.get("aggregates", [])
            if not a.availability
            and a.event_type != EventType.MISSING_DATA
            and a.price > 0
        ]
        avg_price = average_stockout_price(prices_during_stockout, item["current_price"])
        lost_total += m.adjusted_velocity * m.stockout_days * avg_price
    sb.table("store_metrics").upsert({
        "seller_id": seller_id,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "total_sku_count": len(sku_data),
        "oos_sku_count": active_oos_count,
        "low_stock_sku_count": low_count,
        "dead_inventory_sku_count": dead_count,
        "inactive_sku_count": inactive_count,
        "frequently_oos_sku_count": frequently_oos_count,
        "inventory_concentration_50": inv_conc,
        "demand_concentration_50": dem_conc,
        "total_inventory_value": float(total_value),
        "store_frozen_inventory_value": float(frozen_value),
        "lost_revenue": float(lost_total),
        "warehouse_health_score": float(wh_score) if wh_score is not None else None,
        "demand_pattern_distribution": seg_distribution,
    }, on_conflict="seller_id,period_start,period_end").execute()
    return 1


def recalc_seller_all_periods(seller_id, progress=None):
    result = {"products": 0, "metrics_written": 0, "alerts_written": 0,
              "store_metrics_written": 0, "events_written": 0, "changelog_written": 0,
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
                 "error": "period failed"}
        result["periods"].append({"period_days": period_days, **r})
        if period_days == 30:
            for k in ("products", "metrics_written", "alerts_written",
                      "store_metrics_written", "events_written", "changelog_written",
                      "failed_skus"):
                result[k] = r.get(k, 0)
    _bump_progress(progress, phase="done")
    return result


def recalc_all_sellers():
    """БАГ 32: пагинация. БАГ 50: пропускаем sellers с активным manual recalc."""
    sb = get_supabase()
    sellers = fetch_all(sb.table("sellers").select("id"))
    summary = {"sellers": 0, "skipped_concurrent": 0, "metrics_written": 0,
               "alerts_written": 0, "store_metrics_written": 0, "failed_skus": 0}

    try:
        from app.main import _running_recalcs
    except ImportError:
        _running_recalcs = {}

    for s in sellers:
        seller_id = s["id"]
        state = _running_recalcs.get(seller_id) if _running_recalcs else None
        if state and state.get("status") == "running":
            summary["skipped_concurrent"] += 1
            logger.info("recalc-all: skip seller (manual recalc running)",
                        extra={"seller_id": seller_id})
            continue
        try:
            r = recalc_seller_all_periods(seller_id)
            summary["sellers"] += 1
            summary["metrics_written"] += r.get("metrics_written", 0)
            summary["alerts_written"] += r.get("alerts_written", 0)
            summary["store_metrics_written"] += r.get("store_metrics_written", 0)
            summary["failed_skus"] += r.get("failed_skus", 0)
        except Exception as e:
            logger.exception("recalc failed for seller %s: %s", seller_id, e)
    return summary
