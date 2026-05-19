"""Пересчёт метрик селлера: events, tvelo_metrics, store_metrics, alerts, changelog.

Запускается из FastAPI endpoints (/jobs/recalc/{seller_id}) и APScheduler.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from statistics import median as _median
from typing import Optional

import pytz

from app.db import fetch_all, get_supabase
from app.engine.alerts import (
    critical_stock_alert,
    dead_inventory_alert,
    low_stock_alert,
    repeated_stockout_alert,
)
from app.engine.events import classify_event
from app.engine.health import is_underestimated_sku
from app.engine.lost_revenue import average_stockout_price
from app.engine.pipeline import DailyAggregate, compute_metrics_for_sku
from app.engine.price import calculate_elasticity, detect_price_changes
from app.engine.store import (
    SkuHealthInput,
    SkuValue,
    concentration_50,
    demand_weight,
    frozen_inventory_value,
    total_inventory_value,
    warehouse_health_score,
)
from app.schemas import EventType, TVeloMetric

logger = logging.getLogger("veloseller.recalc")


# ============================================================================
# Helpers
# ============================================================================

def _seller_timezone(sb, seller_id: str) -> str:
    res = sb.table("sellers").select("timezone").eq("id", seller_id).execute()
    return (res.data[0] if res.data else {}).get("timezone") or "UTC"


def _event_message(et: EventType, delta: Optional[int]) -> str:
    """Сообщение для changelog (Rule 11.x)."""
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
    """Влияние события на confidence (для отображения в changelog)."""
    return {
        EventType.REPLENISHMENT_LIKE: -3.33,
        EventType.ANOMALY_LIKE: -3.33,
        EventType.MISSING_DATA: -3.33,
    }.get(et, 0.0)


# ============================================================================
# Build daily aggregates
# ============================================================================

def build_daily_aggregates(
    snapshots_rows: list[dict],
    period_start: date,
    period_end: date,
    seller_tz: pytz.tzinfo.BaseTzInfo,
) -> tuple[list[DailyAggregate], list[dict]]:
    """Из сырых snapshots собрать DailyAggregate за период.

    Возвращает (aggregates, event_rows_for_db) — второй список для записи в inventory_events.
    """
    by_day: dict[date, dict] = {}
    for row in sorted(snapshots_rows, key=lambda r: r["snapshot_time"]):
        ts = datetime.fromisoformat(row["snapshot_time"].replace("Z", "+00:00"))
        local_day = ts.astimezone(seller_tz).date()
        by_day[local_day] = row

    abs_deltas_history: list[int] = []
    prev_stock: Optional[int] = None
    prev_snapshot_id: Optional[str] = None
    prev_exists = False

    aggregates: list[DailyAggregate] = []
    event_rows: list[dict] = []

    cur = period_start
    while cur <= period_end:
        if cur in by_day:
            row = by_day[cur]
            stock = int(row["stock_quantity"])
            price = float(row["price"])
            avail = bool(row["availability"])
            delta = (stock - prev_stock) if prev_exists else None

            median_abs = _median(abs_deltas_history) if abs_deltas_history else None
            et, excluded = classify_event(delta, median_abs, prev_exists)
            if et == EventType.SALES_LIKE and delta is not None:
                abs_deltas_history.append(abs(delta))

            aggregates.append(DailyAggregate(
                day=cur,
                availability=avail,
                end_of_day_stock=stock,
                price=price,
                event_type=et,
                delta_stock=delta,
                excluded_from_confirmed_metrics=excluded,
            ))

            # Запись для inventory_events
            event_rows.append({
                "product_id": row.get("product_id"),  # будет проставлен снаружи если None
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
                day=cur,
                availability=False,
                end_of_day_stock=prev_stock or 0,
                price=0.0,
                event_type=EventType.MISSING_DATA,
                delta_stock=None,
                excluded_from_confirmed_metrics=True,
            ))
            # missing_data не пишем в inventory_events (нет current_snapshot_id), но запишем в changelog
        cur = cur + timedelta(days=1)

    # Rule 11.x: recount detection — ищем пары компенсирующих снапшотов в одном дне
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
            recount_days: set[date] = set()
            for snap_a, snap_b in recount_pairs:
                recount_days.add(snap_a.snapshot_time.astimezone(seller_tz).date())
            # Перетипируем aggregates на recount_like для тех дней
            for i, a in enumerate(aggregates):
                if a.day in recount_days and a.event_type != EventType.MISSING_DATA:
                    aggregates[i] = DailyAggregate(
                        day=a.day, availability=a.availability,
                        end_of_day_stock=a.end_of_day_stock, price=a.price,
                        event_type=EventType.RECOUNT_LIKE,
                        delta_stock=a.delta_stock,
                        excluded_from_confirmed_metrics=True,
                    )
                    # Обновляем event_rows
                    for er in event_rows:
                        if er["event_date"] == a.day.isoformat():
                            er["event_type"] = EventType.RECOUNT_LIKE.value
                            er["excluded_from_confirmed_metrics"] = True
    except Exception:
        pass  # recount detection — не критичная фича, ошибки не должны ломать pipeline

    return aggregates, event_rows


# ============================================================================
# Persist
# ============================================================================

def _write_inventory_events(sb, product_id: str, event_rows: list[dict], period_start: date, period_end: date) -> int:
    """Перезаписываем inventory_events за период (idempotent)."""
    if not event_rows:
        return 0
    # Удаляем старые за период
    sb.table("inventory_events").delete().eq("product_id", product_id).gte("event_date", period_start.isoformat()).lte("event_date", period_end.isoformat()).execute()
    # Проставляем product_id и фильтруем строки без current_snapshot_id
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


def _write_changelog(sb, seller_id: str, product_id: str, aggregates: list[DailyAggregate], period_start: date, period_end: date) -> int:
    """Записывает в changelog все 'значимые' события (Rule 11.x)."""
    significant = {EventType.REPLENISHMENT_LIKE, EventType.ANOMALY_LIKE, EventType.MISSING_DATA, EventType.RECOUNT_LIKE}
    # Удаляем старые за период
    sb.table("changelog").delete().eq("product_id", product_id).gte("event_date", period_start.isoformat()).lte("event_date", period_end.isoformat()).execute()

    rows = []
    for a in aggregates:
        if a.event_type not in significant:
            continue
        rows.append({
            "seller_id": seller_id,
            "product_id": product_id,
            "event_date": a.day.isoformat(),
            "event_type": a.event_type.value,
            "delta_stock": a.delta_stock,
            "message": _event_message(a.event_type, a.delta_stock),
            "confidence_impact": _confidence_impact(a.event_type),
        })
    if rows:
        sb.table("changelog").insert(rows).execute()
    return len(rows)


def _upsert_or_skip_alert(
    sb, seller_id: str, product_id: str, kind: str, message: str, payload: dict
) -> bool:
    """Создаёт alert если такого активного ещё нет.

    Защита от дубликатов через партиальный UNIQUE-индекс alerts_unique_unread
    на (seller_id, product_id, kind) WHERE acknowledged_at IS NULL.

    Если активный alert уже есть — обновляет message+payload (могут измениться
    числа: coverage_days/stockout_days), но не плодит запись.

    Возвращает True если создан НОВЫЙ alert (для счётчика alerts_written),
    False если только обновлены данные существующего.
    """
    # Проверяем есть ли активный того же типа
    existing = sb.table("alerts").select("id").eq("seller_id", seller_id).eq(
        "product_id", product_id
    ).eq("kind", kind).is_("acknowledged_at", "null").limit(1).execute()

    if existing.data:
        # Обновляем сообщение и payload (числа могли измениться)
        sb.table("alerts").update({
            "message": message,
            "payload": payload,
        }).eq("id", existing.data[0]["id"]).execute()
        return False

    # Создаём новый
    sb.table("alerts").insert({
        "seller_id": seller_id,
        "product_id": product_id,
        "kind": kind,
        "message": message,
        "payload": payload,
    }).execute()
    return True


def _write_alerts(sb, seller_id: str, product_id: str, m: TVeloMetric, underestimated: bool) -> int:
    """Создаёт alert-записи по Rule 10.x — с дедупликацией.

    Если активный alert (acknowledged_at IS NULL) того же (seller, product, kind)
    уже есть, не плодим, а только обновляем message/payload.

    Также автоматически "решает" (acknowledged_at = now) старые активные алерты,
    которые теперь не сработали (условие больше не выполняется) — чтобы inbox
    не оставался забит устаревшими алертами.
    """
    cov = m.coverage_days
    desired_alerts: list[tuple[str, str]] = []  # (kind, message)
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

    # Auto-resolve: алерты на этот SKU, которые ВЫ ОТКЛЮЧИЛИСЬ (условие пропало)
    # — закрываем как auto-acknowledged.
    existing_active = sb.table("alerts").select("id,kind").eq(
        "seller_id", seller_id
    ).eq("product_id", product_id).is_("acknowledged_at", "null").execute()
    for row in (existing_active.data or []):
        if row["kind"] not in desired_kinds:
            sb.table("alerts").update({
                "acknowledged_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", row["id"]).execute()

    new_count = 0
    for kind, msg in desired_alerts:
        if _upsert_or_skip_alert(sb, seller_id, product_id, kind, msg, payload):
            new_count += 1
    return new_count


# ============================================================================
# Main entry point
# ============================================================================

def recalc_seller(seller_id: str, period_days: int = 30) -> dict:
    """Полный пересчёт всех метрик селлера: events, tvelo_metrics, store_metrics, alerts, changelog."""
    sb = get_supabase()
    period_end = date.today()
    period_start = period_end - timedelta(days=period_days - 1)
    seller_tz = pytz.timezone(_seller_timezone(sb, seller_id))

    # ВАЖНО: используем fetch_all для пагинации — иначе Supabase режет до 1000 строк,
    # и у селлеров с 1000+ SKU считается только первая 1000 (баг был на проде).
    products = fetch_all(
        sb.table("products").select("product_id,sku").eq("seller_id", seller_id)
    )
    if not products:
        return {"products": 0, "metrics_written": 0, "alerts_written": 0, "store_metrics_written": 0}

    metrics_written = 0
    alerts_written = 0
    events_written = 0
    changelog_written = 0

    sku_data: list[dict] = []
    velocities_for_median: list[float] = []

    # 1-й проход: собираем метрики и события
    for p in products:
        pid = p["product_id"]
        history_start = (period_start - timedelta(days=30)).isoformat()
        # У одного SKU редко бывает >1000 снапшотов за 60 дней, но на всякий случай
        # тоже через fetch_all (max 2 snapshots/day × 60 days = 120; запас огромный)
        rows = fetch_all(
            sb.table("inventory_snapshots")
            .select("snapshot_id,snapshot_time,stock_quantity,price,availability")
            .eq("product_id", pid)
            .gte("snapshot_time", history_start)
            .order("snapshot_time")
        )
        if not rows:
            continue

        aggregates, event_rows = build_daily_aggregates(rows, period_start, period_end, seller_tz)
        current_stock = int(rows[-1]["stock_quantity"])
        current_price = float(rows[-1]["price"])

        metric = compute_metrics_for_sku(
            product_id=pid,
            period_start=period_start,
            period_end=period_end,
            daily_aggregates=aggregates,
            current_stock=current_stock,
        )

        # Записываем events и changelog сразу
        events_written += _write_inventory_events(sb, pid, event_rows, period_start, period_end)
        changelog_written += _write_changelog(sb, seller_id, pid, aggregates, period_start, period_end)

        # Rule 12.1: детектим изменения цены и пишем в changelog
        daily_prices = [(a.day, a.price) for a in aggregates if a.price > 0]
        price_changes = detect_price_changes(daily_prices)
        if price_changes:
            price_rows = [
                {
                    "product_id": pid,
                    "seller_id": seller_id,
                    "event_date": pc.day.isoformat(),
                    "event_type": "recount_like",  # ближайший по семантике; UI отображает как price_change
                    "delta_stock": None,
                    "message": f"Цена изменилась: {pc.previous_price:.2f} → {pc.new_price:.2f} ({pc.delta_pct:+.1f}%)",
                    "confidence_impact": 0.0,
                }
                for pc in price_changes
            ]
            sb.table("changelog").insert(price_rows).execute()
            changelog_written += len(price_rows)

            # Rule 12.3: считаем elasticity для каждого ценового изменения
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
                            "product_id": pid,
                            "seller_id": seller_id,
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
            "pid": pid,
            "metric": metric,
            "current_stock": current_stock,
            "current_price": current_price,
            "availability_now": current_stock > 0,
            "aggregates": aggregates,
        })
        if metric.adjusted_velocity > 0:
            velocities_for_median.append(metric.adjusted_velocity)

    median_store_velocity = _median(velocities_for_median) if velocities_for_median else 0.0

    # 2-й проход: tvelo_metrics + alerts + underestimated_sku
    for item in sku_data:
        pid = item["pid"]
        m: TVeloMetric = item["metric"]

        underestimated = is_underestimated_sku(
            stockout_days=m.stockout_days,
            adjusted_velocity=m.adjusted_velocity,
            median_store_velocity=median_store_velocity,
            confidence_score=m.confidence_score,
        )

        sb.table("tvelo_metrics").upsert({
            "product_id": pid,
            "period_start": m.period_start.isoformat(),
            "period_end": m.period_end.isoformat(),
            "confirmed_velocity": float(m.confirmed_velocity),
            "adjusted_velocity": float(m.adjusted_velocity),
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

    # 3-й проход: store_metrics
    store_written = _write_store_metrics(sb, seller_id, sku_data, period_start, period_end)

    return {
        "products": len(products),
        "metrics_written": metrics_written,
        "alerts_written": alerts_written,
        "events_written": events_written,
        "changelog_written": changelog_written,
        "store_metrics_written": store_written,
    }


def _write_store_metrics(sb, seller_id: str, sku_data: list[dict], period_start: date, period_end: date) -> int:
    """Агрегирует и записывает store_metrics (раздел 1.5, Rule 13.2)."""
    if not sku_data:
        return 0

    sku_health_inputs = [
        SkuHealthInput(
            product_id=item["pid"],
            health_score=item["metric"].sku_health_score or 0,
            stock_quantity=item["current_stock"],
            price=item["current_price"],
            adjusted_velocity=item["metric"].adjusted_velocity,
            median_30d_velocity=item["metric"].adjusted_velocity,  # proxy
            is_out_of_stock=not item["availability_now"],
        )
        for item in sku_data
    ]

    # Концентрации
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

    # Distribution по сегментам
    seg_distribution: dict[str, int] = {}
    for item in sku_data:
        seg = (item["metric"].segment.value if item["metric"].segment else "insufficient_data")
        seg_distribution[seg] = seg_distribution.get(seg, 0) + 1

    # Подсчёт по статусам (для KPI-карточек в dashboard)
    oos_count = sum(1 for item in sku_data if not item["availability_now"])
    low_count = sum(
        1 for item in sku_data
        if item["metric"].coverage_days is not None and item["metric"].coverage_days <= 7
    )
    dead_count = sum(
        1 for item in sku_data
        if item["metric"].coverage_days is not None and item["metric"].coverage_days > 180
    )

    # Lost revenue с правильной AverageStockoutPrice по Rule 9.2
    lost_total = 0.0
    for item in sku_data:
        m = item["metric"]
        if m.adjusted_velocity <= 0 or m.stockout_days <= 0:
            continue
        prices_during_stockout = [
            a.price for a in item.get("aggregates", [])
            if not a.availability and a.price > 0
        ]
        avg_price = average_stockout_price(prices_during_stockout, item["current_price"])
        lost_total += m.adjusted_velocity * m.stockout_days * avg_price

    sb.table("store_metrics").upsert({
        "seller_id": seller_id,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "total_sku_count": len(sku_data),
        "oos_sku_count": oos_count,
        "low_stock_sku_count": low_count,
        "dead_inventory_sku_count": dead_count,
        "inventory_concentration_50": inv_conc,
        "demand_concentration_50": dem_conc,
        "total_inventory_value": float(total_value),
        "store_frozen_inventory_value": float(frozen_value),
        "lost_revenue": float(lost_total),
        "warehouse_health_score": float(wh_score) if wh_score is not None else None,
        "demand_pattern_distribution": seg_distribution,
    }, on_conflict="seller_id,period_start,period_end").execute()

    return 1


def recalc_seller_all_periods(seller_id: str) -> dict:
    """Пересчёт по всем периодам: 7, 30, 90 дней."""
    result = {"products": 0, "metrics_written": 0, "alerts_written": 0,
              "store_metrics_written": 0, "events_written": 0, "changelog_written": 0,
              "periods": []}
    for period_days in (7, 30, 90):
        r = recalc_seller(seller_id, period_days=period_days)
        result["periods"].append({"period_days": period_days, **r})
        if period_days == 30:
            for k in ("products", "metrics_written", "alerts_written",
                      "store_metrics_written", "events_written", "changelog_written"):
                result[k] = r.get(k, 0)
    return result


def recalc_all_sellers() -> dict:
    """Cron: пересчёт всех селлеров по всем периодам."""
    sb = get_supabase()
    sellers = sb.table("sellers").select("id").execute()
    summary = {"sellers": 0, "metrics_written": 0, "alerts_written": 0, "store_metrics_written": 0}
    for s in (sellers.data or []):
        try:
            r = recalc_seller_all_periods(s["id"])
            summary["sellers"] += 1
            summary["metrics_written"] += r.get("metrics_written", 0)
            summary["alerts_written"] += r.get("alerts_written", 0)
            summary["store_metrics_written"] += r.get("store_metrics_written", 0)
        except Exception as e:
            logger.exception("recalc failed for seller %s: %s", s["id"], e)
    return summary
