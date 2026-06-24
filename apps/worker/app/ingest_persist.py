"""Слой персистентности ингеста, вынесенный из main.py (разгрузка god-file).

Чистые функции без module-state и без реассайна глобалов (в отличие от очередей
пересчёта/синка, которые остаются в main.py): upsert товаров, запись снапшотов с
дедупом, отметка статуса синка склада и уведомления об ошибках синка.

Тесты патчат get_supabase/fetch_all именно в ЭТОМ модуле (app.ingest_persist.*),
т.к. _persist_snapshots резолвит их здесь.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.db import fetch_all, get_supabase
from app.schemas import SnapshotInput, SourceType  # noqa: F401  (SourceType — для совместимости импорта)

logger = logging.getLogger("veloseller.worker")

_PRODUCTS_IN_BATCH = 500
_INSERT_BATCH = 500
_DEDUP_WINDOW_HOURS = 20

SYNC_FAILURE_AUTO_PAUSE_THRESHOLD = 3
SYNC_ERROR_NOTIFY_COOLDOWN_HOURS = 24

# Маркеры ВРЕМЕННЫХ (транзиентных) ошибок синка: rate-limit (429, WB Statistics
# /supplier/stocks 1 req/60s), 5xx маркетплейса, сеть/timeout. Жёсткие ошибки
# (401/403 токен/права, превышение лимита тарифа, валидация) сюда НЕ попадают —
# повтор с теми же условиями бесполезен и ведёт к авто-паузе после порога.
# Единый источник правды И для авто-паузы (_mark_connection_synced), И для джоба
# авто-повтора (scheduler._job_retry_transient_errors): склад, который мы НЕ паузим,
# обязан быть ровно тем, который повторяет retry-transient.
_TRANSIENT_ERROR_MARKERS = (
    "429", "too many requests", "rate limit",
    "502", "503", "504", "bad gateway", "service unavailable",
    "timeout", "timed out", "econnrefused", "temporarily",
)


def is_transient_sync_error(msg: object) -> bool:
    """Временная ли ошибка синка (имеет смысл авто-повтор, а не авто-пауза)."""
    if not msg:
        return False
    m = str(msg).lower()
    return any(marker in m for marker in _TRANSIENT_ERROR_MARKERS)


def _ozon_kind_from_warehouse(warehouse_kind: Optional[str]) -> Optional[str]:
    if warehouse_kind == "ozon_fbo":
        return "fbo"
    if warehouse_kind == "ozon_fbs":
        return "fbs"
    return None


def _ensure_products(sb, seller_id: str, connection_id: str, snapshots: list[SnapshotInput]) -> dict[str, str]:
    if not snapshots:
        return {}
    if not connection_id:
        raise ValueError("_ensure_products требует connection_id (NOT NULL в products)")

    rows = [{
        "seller_id": seller_id,
        "connection_id": connection_id,
        "sku": s.sku,
        "product_name": s.product_name or s.sku,
        "brand": s.brand,
        "category": s.category,
    } for s in snapshots]
    # upsert через RPC bulk_upsert_products: brand/category НЕ затираются NULL,
    # если источник на этом синке их не отдал (COALESCE на стороне БД сохраняет
    # последнее известное значение). product_name обновляется всегда.
    for i in range(0, len(rows), _PRODUCTS_IN_BATCH):
        sb.rpc("bulk_upsert_products", {"p_rows": rows[i:i + _PRODUCTS_IN_BATCH]}).execute()

    all_skus = [s.sku for s in snapshots]
    sku_to_pid: dict[str, str] = {}
    for i in range(0, len(all_skus), _PRODUCTS_IN_BATCH):
        batch = all_skus[i:i + _PRODUCTS_IN_BATCH]
        res = (
            sb.table("products").select("product_id,sku")
            .eq("seller_id", seller_id)
            .eq("connection_id", connection_id)
            .in_("sku", batch).execute()
        )
        for r in (res.data or []):
            sku_to_pid[r["sku"]] = r["product_id"]
    return sku_to_pid


def _persist_snapshots(seller_id, connection_id, source, snapshots):
    if not snapshots:
        return 0
    if not connection_id:
        logger.warning("persist_snapshots called without connection_id — skipping product upsert",
                       extra={"seller_id": seller_id, "skus": len(snapshots)})
        return 0

    sb = get_supabase()
    sku_to_pid = _ensure_products(sb, seller_id, connection_id, snapshots)

    unmapped_count = sum(1 for s in snapshots if s.sku not in sku_to_pid)
    if unmapped_count > 0:
        logger.warning("snapshots with unmapped SKUs", extra={
            "seller_id": seller_id, "connection_id": connection_id,
            "unmapped": unmapped_count, "total": len(snapshots),
        })

    pids = list(sku_to_pid.values())
    last_snapshots: dict[str, dict] = {}
    if pids:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=_DEDUP_WINDOW_HOURS)).isoformat()
        IN_BATCH = 200
        for i in range(0, len(pids), IN_BATCH):
            batch_pids = pids[i:i + IN_BATCH]
            recent = fetch_all(
                sb.table("inventory_snapshots")
                .select("product_id,stock_quantity,price,marketing_price,snapshot_time")
                .in_("product_id", batch_pids)
                .gte("snapshot_time", cutoff)
                .order("snapshot_time", desc=True)
            )
            for row in recent:
                pid = row["product_id"]
                if pid not in last_snapshots:
                    last_snapshots[pid] = row

    rows = []
    skipped_duplicates = 0
    skipped_unmapped = 0
    skipped_no_price = 0
    for s in snapshots:
        pid = sku_to_pid.get(s.sku)
        if not pid:
            skipped_unmapped += 1
            continue
        last = last_snapshots.get(pid)
        last_price = float(last.get("price") or 0) if last is not None else None

        # Цена неизвестна (источник не смог получить — частичный сбой фетча): не
        # пишем фантомный 0, а переносим последнюю известную цену. Нет истории —
        # пропускаем снапшот (станет MISSING-день), чтобы не завести 0 в историю цен.
        if s.price is None:
            if last_price is None:
                skipped_no_price += 1
                continue
            cur_price = last_price
        else:
            cur_price = float(s.price)

        if last is not None:
            last_stock = int(last.get("stock_quantity") or 0)
            cur_stock = int(s.stock_quantity)
            # marketing_price тоже в ключе дедупа (#3): иначе изменение скидки МП при
            # тех же stock+price скипалось бы и факт. цена на графике не обновлялась.
            # Лишние строки безопасны: stock тот же → движок не видит ложных продаж.
            last_mkt = last.get("marketing_price")
            cur_mkt = float(s.marketing_price) if s.marketing_price is not None else None
            mkt_same = (
                (last_mkt is None and cur_mkt is None)
                or (last_mkt is not None and cur_mkt is not None
                    and abs(float(last_mkt) - cur_mkt) < 0.01)
            )
            if last_stock == cur_stock and abs(last_price - cur_price) < 0.01 and mkt_same:
                skipped_duplicates += 1
                continue
        ts = s.snapshot_time or datetime.now(timezone.utc)
        rows.append({
            "product_id": pid, "connection_id": connection_id,
            "stock_quantity": s.stock_quantity, "price": cur_price,
            "availability": s.stock_quantity > 0,
            "snapshot_time": ts.isoformat(), "source": source.value,
            "seller_price": float(s.seller_price) if s.seller_price is not None else None,
            "marketing_price": float(s.marketing_price) if s.marketing_price is not None else None,
            "commission_pct": float(s.commission_pct) if s.commission_pct is not None else None,
        })
    if rows:
        for i in range(0, len(rows), _INSERT_BATCH):
            sb.table("inventory_snapshots").insert(rows[i:i + _INSERT_BATCH]).execute()
    logger.info("snapshots persisted", extra={
        "seller_id": seller_id, "connection_id": connection_id,
        "inserted": len(rows), "skipped_duplicates": skipped_duplicates,
        "skipped_unmapped": skipped_unmapped, "skipped_no_price": skipped_no_price,
        "total_skus": len(snapshots),
        "batches": (len(rows) + _INSERT_BATCH - 1) // _INSERT_BATCH if rows else 0,
    })
    return len(rows)


def _send_sync_error_notifications(
    sb,
    connection_id: str,
    error_message: str,
    failure_count: int,
    auto_paused: bool,
) -> None:
    try:
        conn_res = (
            sb.table("data_connections")
            .select("name,warehouse_kind,seller_id,error_notified_at")
            .eq("id", connection_id)
            .single()
            .execute()
        )
        conn = conn_res.data
        if not conn:
            return

        if not auto_paused and conn.get("error_notified_at"):
            try:
                notified = datetime.fromisoformat(
                    conn["error_notified_at"].replace("Z", "+00:00")
                )
                cooldown = timedelta(hours=SYNC_ERROR_NOTIFY_COOLDOWN_HOURS)
                if datetime.now(timezone.utc) - notified < cooldown:
                    return
            except (ValueError, AttributeError):
                pass

        seller_res = (
            sb.table("sellers")
            .select("email,notify_email,notify_telegram,telegram_chat_id")
            .eq("id", conn["seller_id"])
            .single()
            .execute()
        )
        seller = seller_res.data
        if not seller:
            return

        warehouse_name = conn.get("name") or "—"
        warehouse_kind = conn.get("warehouse_kind") or ""

        if seller.get("notify_email") and seller.get("email"):
            try:
                from app.notifications import send_sync_error_notification
                send_sync_error_notification(
                    to_email=seller["email"],
                    warehouse_name=warehouse_name,
                    warehouse_kind=warehouse_kind,
                    error_message=error_message,
                    failure_count=failure_count,
                    auto_paused=auto_paused,
                )
            except Exception:
                logger.exception("send_sync_error_notification email failed",
                                 extra={"connection_id": connection_id})

        if seller.get("notify_telegram") and seller.get("telegram_chat_id"):
            try:
                from app.telegram import send_message, format_sync_error_message, clear_dead_telegram
                msg = format_sync_error_message(
                    warehouse_name=warehouse_name,
                    warehouse_kind=warehouse_kind,
                    error_message=error_message,
                    failure_count=failure_count,
                    auto_paused=auto_paused,
                )
                send_message(
                    seller["telegram_chat_id"], msg,
                    on_dead_chat=lambda: clear_dead_telegram(sb, conn["seller_id"]),
                )
            except Exception:
                logger.exception("send_sync_error_notification telegram failed",
                                 extra={"connection_id": connection_id})

        sb.table("data_connections").update({
            "error_notified_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", connection_id).execute()

    except Exception:
        logger.exception("sync error notifications dispatch failed",
                         extra={"connection_id": connection_id})


def _mark_connection_synced(sb, connection_id: str, error: Optional[str] = None) -> None:
    now_iso = datetime.now(timezone.utc).isoformat()

    if error is None:
        sb.table("data_connections").update({
            "last_sync_at": now_iso,
            "status": "active",
            "last_error": None,
            "failure_count": 0,
            "error_notified_at": None,
        }).eq("id", connection_id).execute()
        return

    try:
        cur_res = (
            sb.table("data_connections")
            .select("failure_count")
            .eq("id", connection_id)
            .single()
            .execute()
        )
        cur_failures = int((cur_res.data or {}).get("failure_count") or 0)
    except Exception:
        cur_failures = 0

    new_failures = cur_failures + 1
    # Авто-пауза ТОЛЬКО на стойких (не-транзиентных) ошибках: протухший токен,
    # нет прав, превышен лимит тарифа, валидация. Транзиентные (429-лимит WB
    # Statistics 1 req/60s, 5xx, сеть) НЕ паузим: из paused склад достаётся лишь
    # РУЧНЫМ включением, тогда как 'error' сам поднимается джобом retry-transient
    # вне пиковой нагрузки. Инцидент 24.06.2026: ночной батч 02:00 UTC ловил 429
    # на /supplier/stocks и вешал здоровые FBO-склады в ручную паузу — хотя вне
    # пика тот же синк проходит с первой попытки. Реально застрявший склад
    # (>30ч без успешного синка) ловит _job_monitor_sync_freshness отдельно.
    transient = is_transient_sync_error(error)
    auto_paused = (new_failures >= SYNC_FAILURE_AUTO_PAUSE_THRESHOLD) and not transient
    new_status = "paused" if auto_paused else "error"

    sb.table("data_connections").update({
        "last_sync_at": now_iso,
        "status": new_status,
        "last_error": error,
        "failure_count": new_failures,
    }).eq("id", connection_id).execute()

    logger.warning("sync failure tracked", extra={
        "connection_id": connection_id,
        "failure_count": new_failures,
        "auto_paused": auto_paused,
        "transient": transient,
        "status": new_status,
    })

    # Транзиентные ошибки не спамим пер-фейл уведомлениями — они саморазрешаются
    # ретраем; шлём только по стойким (где нужно ручное вмешательство). Застрявший
    # транзиент >30ч поймает мониторинг свежести синка отдельным алертом.
    if not transient:
        _send_sync_error_notifications(sb, connection_id, error, new_failures, auto_paused)


def _try_acquire_sync_lock(sb, connection_id: str) -> bool:
    try:
        cur = (sb.table("data_connections")
               .select("status")
               .eq("id", connection_id)
               .single()
               .execute())
        if (cur.data or {}).get("status") == "paused":
            logger.info("sync skipped — connection paused (auto-disabled)",
                        extra={"connection_id": connection_id})
            return False
    except Exception:
        # Пре-проверка paused не критична: честный лок ниже всё равно отработает.
        # Логируем на debug, а не глотаем молча.
        logger.debug("paused pre-check failed", extra={"connection_id": connection_id})

    try:
        res = (sb.table("data_connections")
               .update({"status": "syncing", "last_error": None})
               .eq("id", connection_id)
               .neq("status", "syncing")
               .execute())
        return bool(res.data)
    except Exception:
        logger.exception("sync lock acquire failed", extra={"connection_id": connection_id})
        return False
