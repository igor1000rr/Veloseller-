"""Veloseller worker — FastAPI приложение."""
from __future__ import annotations

import hmac
import logging
import re
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import BackgroundTasks, Depends, FastAPI, File, Header, HTTPException, Request, UploadFile

from app.config import settings
from app.db import fetch_all, get_supabase
from app.jobs.recalc import recalc_all_sellers, recalc_seller, recalc_seller_all_periods
from app.jobs.scheduler import start_scheduler, stop_scheduler
from app.logger import JsonFormatter, setup_logger
from app.schemas import SnapshotInput, SourceType
from app.sources import csv_upload, feed as feed_src, google_sheet, ozon, wildberries

_root = logging.getLogger()
if not any(isinstance(h.formatter, JsonFormatter) for h in _root.handlers if h.formatter):
    _root.handlers.clear()
    import sys as _sys
    _h = logging.StreamHandler(_sys.stdout)
    _h.setFormatter(JsonFormatter())
    _root.addHandler(_h)
_root.setLevel(logging.INFO)

logger = setup_logger("veloseller.worker")


import os as _os


def _scrub_sentry_event(event: dict, hint=None) -> Optional[dict]:
    # Расширенный список sensitive ключей: добавили PII (email, chat_id, telegram_chat_id)
    # и внутренние ID подписок Stripe.
    SENSITIVE_KEYS = {
        "api_key", "token", "client_id", "password", "secret", "x-worker-secret",
        "authorization", "stripe_subscription_id", "stripe_customer_id",
        "email", "telegram_chat_id", "chat_id",
    }

    def _scrub(obj):
        if isinstance(obj, dict):
            return {k: ("[REDACTED]" if k.lower() in SENSITIVE_KEYS else _scrub(v)) for k, v in obj.items()}
        if isinstance(obj, list):
            return [_scrub(i) for i in obj]
        return obj

    return _scrub(event)


_sentry_dsn = _os.environ.get("SENTRY_DSN")
if _sentry_dsn:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration

        init_kwargs = {
            "dsn": _sentry_dsn,
            "integrations": [
                FastApiIntegration(),
                LoggingIntegration(level=logging.INFO, event_level=logging.ERROR),
            ],
            "environment": _os.environ.get("SENTRY_ENV", "production"),
            "traces_sample_rate": 0.1,
            "release": _os.environ.get("SENTRY_RELEASE"),
            "send_default_pii": False,
            "before_send": _scrub_sentry_event,
        }
        import inspect as _inspect
        _sig = _inspect.signature(sentry_sdk.init)
        if "include_local_variables" in _sig.parameters:
            init_kwargs["include_local_variables"] = False
        elif "with_locals" in _sig.parameters:
            init_kwargs["with_locals"] = False

        sentry_sdk.init(**init_kwargs)
        logger.info("sentry initialized", extra={
            "env": _os.environ.get("SENTRY_ENV", "production"),
            "with_local_vars": False,
        })
    except ImportError:
        logger.warning("SENTRY_DSN set but sentry-sdk not installed — skipping")
    except Exception as _e:
        logger.warning("sentry init failed: %s", _e)


_running_recalcs: dict[str, dict] = {}
_RECALC_STATE_TTL = timedelta(hours=24)
_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)
_CSV_MAX_SIZE_BYTES = 20 * 1024 * 1024

SYNC_FAILURE_AUTO_PAUSE_THRESHOLD = 3
SYNC_ERROR_NOTIFY_COOLDOWN_HOURS = 24


def _is_production() -> bool:
    """Сервер в проде? Проверяет ENV и SENTRY_ENV (fallback)."""
    env = _os.environ.get("ENV", _os.environ.get("SENTRY_ENV", "development")).lower()
    return env == "production"


def _cleanup_old_recalcs() -> None:
    cutoff = datetime.now(timezone.utc) - _RECALC_STATE_TTL
    stale = []
    for sid, state in _running_recalcs.items():
        if state.get("status") in ("done", "error"):
            finished = state.get("finished_at")
            if finished:
                try:
                    if datetime.fromisoformat(finished.replace("Z", "+00:00")) < cutoff:
                        stale.append(sid)
                except (ValueError, AttributeError):
                    stale.append(sid)
    for sid in stale:
        del _running_recalcs[sid]
    if stale:
        logger.info("cleaned up stale recalc states", extra={"count": len(stale)})


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.enable_scheduler:
        start_scheduler()
        logger.info("scheduler started", extra={"event": "lifecycle"})
    yield
    if settings.enable_scheduler:
        stop_scheduler()
        logger.info("scheduler stopped", extra={"event": "lifecycle"})


app = FastAPI(title="Veloseller Worker", version="0.1.0", lifespan=lifespan)


def require_worker_secret(x_worker_secret: Optional[str] = Header(None)) -> None:
    """Аутентификация Web → Worker через X-Worker-Secret.

    SECURITY FIX:
      - hmac.compare_digest вместо != (защита от timing attack).
      - В проде без заданного или с dev-default секретом → 500 (fail-closed).
        Раньше: if secret пуст или == dev-secret-replace-me — auth полностью отключался.
        Сейчас: в dev это было удобно (пропускаем без секрета), но в проде вербовалось.
    """
    secret = settings.worker_secret
    is_dev_default = (not secret) or secret == "dev-secret-replace-me"

    if is_dev_default:
        if _is_production():
            # В проде это ошибка конфига (config.py должен был поймать это на старте).
            # Но на случай если секрет поменялся на dev runtime — fail-closed.
            raise HTTPException(500, "Server misconfigured: worker secret not set")
        # Dev/тесты: пропускаем без секрета
        return

    if not x_worker_secret or not hmac.compare_digest(x_worker_secret, secret):
        raise HTTPException(401, "Invalid worker secret")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "ts": datetime.now(timezone.utc).isoformat()}


_PRODUCTS_IN_BATCH = 500
_INSERT_BATCH = 500
_DEDUP_WINDOW_HOURS = 20


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
    } for s in snapshots]
    for i in range(0, len(rows), _PRODUCTS_IN_BATCH):
        sb.table("products").upsert(
            rows[i:i + _PRODUCTS_IN_BATCH],
            on_conflict="seller_id,connection_id,sku",
        ).execute()

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
                .select("product_id,stock_quantity,price,snapshot_time")
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
    for s in snapshots:
        pid = sku_to_pid.get(s.sku)
        if not pid:
            skipped_unmapped += 1
            continue
        last = last_snapshots.get(pid)
        if last is not None:
            last_stock = int(last.get("stock_quantity") or 0)
            last_price = float(last.get("price") or 0)
            cur_stock = int(s.stock_quantity)
            cur_price = float(s.price)
            if last_stock == cur_stock and abs(last_price - cur_price) < 0.01:
                skipped_duplicates += 1
                continue
        ts = s.snapshot_time or datetime.now(timezone.utc)
        rows.append({
            "product_id": pid, "connection_id": connection_id,
            "stock_quantity": s.stock_quantity, "price": float(s.price),
            "availability": s.stock_quantity > 0,
            "snapshot_time": ts.isoformat(), "source": source.value,
        })
    if rows:
        for i in range(0, len(rows), _INSERT_BATCH):
            sb.table("inventory_snapshots").insert(rows[i:i + _INSERT_BATCH]).execute()
    logger.info("snapshots persisted", extra={
        "seller_id": seller_id, "connection_id": connection_id,
        "inserted": len(rows), "skipped_duplicates": skipped_duplicates,
        "skipped_unmapped": skipped_unmapped, "total_skus": len(snapshots),
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
    """Email + Telegram уведомления о неудаче sync с дедупликацией."""
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
                from app.telegram import send_message, format_sync_error_message
                msg = format_sync_error_message(
                    warehouse_name=warehouse_name,
                    warehouse_kind=warehouse_kind,
                    error_message=error_message,
                    failure_count=failure_count,
                    auto_paused=auto_paused,
                )
                send_message(seller["telegram_chat_id"], msg)
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
    """Обновляет state склада после попытки sync.

    Успех: status='active', failure_count=0, error_notified_at=NULL.
    Ошибка: failure_count++; при >=3 status='paused', иначе 'error'.
    Шлём email/telegram с дедупликацией.
    """
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
    auto_paused = new_failures >= SYNC_FAILURE_AUTO_PAUSE_THRESHOLD
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
        "status": new_status,
    })

    _send_sync_error_notifications(sb, connection_id, error, new_failures, auto_paused)


def _try_acquire_sync_lock(sb, connection_id: str) -> bool:
    """Atomic sync lock + блокировка paused-складов."""
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
        pass

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


def _run_ozon_sync_bg(
    connection_id: str,
    seller_id: str,
    client_id: str,
    api_key: str,
    warehouse_kind: Optional[str] = None,
) -> None:
    sb = get_supabase()
    try:
        kind = _ozon_kind_from_warehouse(warehouse_kind)
        snapshots = ozon.fetch_snapshots(client_id, api_key, kind=kind)
        inserted = _persist_snapshots(seller_id, connection_id, SourceType.MARKETPLACE_API, snapshots)
        _mark_connection_synced(sb, connection_id)
        logger.info("ozon synced (bg)", extra={
            "connection_id": connection_id, "warehouse_kind": warehouse_kind,
            "kind": kind, "inserted": inserted, "fetched_skus": len(snapshots),
        })
    except Exception as e:
        _mark_connection_synced(sb, connection_id, error=str(e)[:500])
        logger.exception("ozon sync failed (bg)", extra={"connection_id": connection_id})


def _run_wb_sync_bg(
    connection_id: str,
    seller_id: str,
    token: str,
    warehouse_kind: Optional[str] = None,
) -> None:
    """BG sync для WB. warehouse_kind определяет flow:

    - wb_fbs → fetch_fbs_snapshots (Marketplace API + Content API + Statistics API для цен)
    - wb_fbo / legacy / None → fetch_snapshots (Statistics API остатки FBO)
    """
    sb = get_supabase()
    try:
        if warehouse_kind == "wb_fbs":
            snapshots = wildberries.fetch_fbs_snapshots(token)
            wb_flow = "fbs"
        else:
            snapshots = wildberries.fetch_snapshots(token)
            wb_flow = "fbo"
        inserted = _persist_snapshots(seller_id, connection_id, SourceType.MARKETPLACE_API, snapshots)
        _mark_connection_synced(sb, connection_id)
        logger.info("wb synced (bg)", extra={
            "connection_id": connection_id, "warehouse_kind": warehouse_kind,
            "wb_flow": wb_flow, "inserted": inserted, "fetched_skus": len(snapshots),
        })
    except Exception as e:
        _mark_connection_synced(sb, connection_id, error=str(e)[:500])
        logger.exception("wb sync failed (bg)", extra={"connection_id": connection_id})


def _run_google_sheet_sync_bg(connection_id: str, seller_id: str, sheet: str, worksheet_index: int) -> None:
    sb = get_supabase()
    try:
        snapshots = google_sheet.fetch_snapshots(sheet, worksheet_index)
        inserted = _persist_snapshots(seller_id, connection_id, SourceType.GOOGLE_SHEET, snapshots)
        _mark_connection_synced(sb, connection_id)
        logger.info("google sheet synced (bg)", extra={"connection_id": connection_id, "inserted": inserted})
    except Exception as e:
        _mark_connection_synced(sb, connection_id, error=str(e)[:500])
        logger.exception("google sheet sync failed (bg)", extra={"connection_id": connection_id})


def _run_feed_sync_bg(connection_id: str, seller_id: str, feed_url: str) -> None:
    sb = get_supabase()
    try:
        snapshots = feed_src.fetch_snapshots(feed_url)
        inserted = _persist_snapshots(seller_id, connection_id, SourceType.FEED, snapshots)
        _mark_connection_synced(sb, connection_id)
        logger.info("feed synced (bg)", extra={"connection_id": connection_id, "inserted": inserted})
    except Exception as e:
        _mark_connection_synced(sb, connection_id, error=str(e)[:500])
        logger.exception("feed sync failed (bg)", extra={"connection_id": connection_id})


@app.post("/ingest/csv", dependencies=[Depends(require_worker_secret)])
async def ingest_csv(seller_id: str, file: UploadFile = File(...)) -> dict:
    raise HTTPException(
        410,
        "CSV upload через этот endpoint устарел. "
        "Создайте склад типа 'CSV' через /connections/new и загружайте файлы туда.",
    )


@app.post("/ingest/google-sheet/{connection_id}", dependencies=[Depends(require_worker_secret)])
def ingest_google_sheet(connection_id: str, background_tasks: BackgroundTasks) -> dict:
    sb = get_supabase()
    conn = sb.table("data_connections").select("*").eq("id", connection_id).single().execute()
    if not conn.data:
        raise HTTPException(404, "Connection not found")
    cfg = conn.data.get("config") or {}
    sheet = cfg.get("sheet_url") or cfg.get("sheet_id")
    if not sheet:
        raise HTTPException(400, "config.sheet_url или config.sheet_id обязателен")
    if not _try_acquire_sync_lock(sb, connection_id):
        return {"started": False, "status": "running", "message": "Sync уже идёт или склад на паузе"}
    background_tasks.add_task(_run_google_sheet_sync_bg, connection_id, conn.data["seller_id"], sheet, cfg.get("worksheet_index", 0))
    return {"started": True, "status": "running", "message": "Sync запущен в фоне"}


@app.post("/ingest/ozon/{connection_id}", dependencies=[Depends(require_worker_secret)])
def ingest_ozon(connection_id: str, background_tasks: BackgroundTasks) -> dict:
    sb = get_supabase()
    conn = sb.table("data_connections").select("*").eq("id", connection_id).single().execute()
    if not conn.data:
        raise HTTPException(404, "Connection not found")
    cfg = conn.data.get("config") or {}
    client_id = cfg.get("client_id")
    api_key = cfg.get("api_key")
    from app.crypto import decrypt_if_encrypted
    client_id = decrypt_if_encrypted(client_id)
    api_key = decrypt_if_encrypted(api_key)
    if not client_id or not api_key:
        raise HTTPException(400, "config.client_id и config.api_key обязательны")
    if not _try_acquire_sync_lock(sb, connection_id):
        return {"started": False, "status": "running", "message": "Sync уже идёт или склад на паузе"}
    warehouse_kind = conn.data.get("warehouse_kind")
    background_tasks.add_task(
        _run_ozon_sync_bg,
        connection_id, conn.data["seller_id"], client_id, api_key, warehouse_kind,
    )
    return {"started": True, "status": "running", "message": "Sync запущен в фоне"}


@app.post("/ingest/wb/{connection_id}", dependencies=[Depends(require_worker_secret)])
def ingest_wb(connection_id: str, background_tasks: BackgroundTasks) -> dict:
    sb = get_supabase()
    conn = sb.table("data_connections").select("*").eq("id", connection_id).single().execute()
    if not conn.data:
        raise HTTPException(404, "Connection not found")
    cfg = conn.data.get("config") or {}
    token = cfg.get("token") or cfg.get("api_key")
    from app.crypto import decrypt_if_encrypted
    token = decrypt_if_encrypted(token)
    if not token:
        raise HTTPException(400, "config.token обязателен")
    if not _try_acquire_sync_lock(sb, connection_id):
        return {"started": False, "status": "running", "message": "Sync уже идёт или склад на паузе"}
    warehouse_kind = conn.data.get("warehouse_kind")
    background_tasks.add_task(
        _run_wb_sync_bg,
        connection_id, conn.data["seller_id"], token, warehouse_kind,
    )
    return {"started": True, "status": "running", "message": "Sync запущен в фоне"}


@app.post("/ingest/feed/{connection_id}", dependencies=[Depends(require_worker_secret)])
def ingest_feed(connection_id: str, background_tasks: BackgroundTasks) -> dict:
    sb = get_supabase()
    conn = sb.table("data_connections").select("*").eq("id", connection_id).single().execute()
    if not conn.data:
        raise HTTPException(404, "Connection not found")
    cfg = conn.data.get("config") or {}
    feed_url = cfg.get("feed_url")
    if not feed_url:
        raise HTTPException(400, "config.feed_url обязателен")
    if not _try_acquire_sync_lock(sb, connection_id):
        return {"started": False, "status": "running", "message": "Sync уже идёт или склад на паузе"}
    background_tasks.add_task(_run_feed_sync_bg, connection_id, conn.data["seller_id"], feed_url)
    return {"started": True, "status": "running", "message": "Sync запущен в фоне"}


def _run_recalc_bg(seller_id: str) -> None:
    progress: dict = {
        "phase": "starting", "processed": 0, "total": 0, "period_days": 30,
        "current_period_index": 0, "total_periods": 3,
    }
    _running_recalcs[seller_id] = {
        "started_at": datetime.now(timezone.utc).isoformat(),
        "status": "running", "result": None, "error": None, "progress": progress,
    }
    try:
        result = recalc_seller_all_periods(seller_id, progress=progress)
        _running_recalcs[seller_id].update({
            "status": "done", "finished_at": datetime.now(timezone.utc).isoformat(), "result": result,
        })
        logger.info("recalc done (bg)", extra={"seller_id": seller_id, **{k: v for k, v in result.items() if isinstance(v, (int, float))}})
    except Exception as e:
        _running_recalcs[seller_id].update({
            "status": "error", "finished_at": datetime.now(timezone.utc).isoformat(),
            "error": str(e)[:500],
        })
        logger.exception("recalc failed (bg)", extra={"seller_id": seller_id})


@app.post("/jobs/recalc/{seller_id}", dependencies=[Depends(require_worker_secret)])
def job_recalc_seller(seller_id: str, background_tasks: BackgroundTasks, sync: bool = False) -> dict:
    _cleanup_old_recalcs()

    existing = _running_recalcs.get(seller_id)
    if existing and existing.get("status") == "running":
        return {
            "started": False, "status": "running",
            "started_at": existing.get("started_at"),
            "message": "Расчёт уже идёт, дождитесь завершения",
        }
    if sync:
        result = recalc_seller_all_periods(seller_id)
        return result
    background_tasks.add_task(_run_recalc_bg, seller_id)
    return {
        "started": True, "status": "running",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "message": "Расчёт запущен в фоне, цифры появятся через несколько минут",
    }


@app.get("/jobs/recalc/{seller_id}/status", dependencies=[Depends(require_worker_secret)])
def job_recalc_status(seller_id: str) -> dict:
    state = _running_recalcs.get(seller_id)
    if not state:
        return {"status": "idle", "started_at": None, "result": None, "error": None, "progress": None}
    return state


@app.post("/jobs/recalc-all", dependencies=[Depends(require_worker_secret)])
def job_recalc_all() -> dict:
    logger.info("recalc-all start")
    result = recalc_all_sellers()
    logger.info("recalc-all done", extra=result)
    return result


@app.post("/telegram/webhook")
async def telegram_webhook(request: Request, x_telegram_bot_api_secret_token: Optional[str] = Header(None)) -> dict:
    """Telegram webhook для связывания telegram_chat_id с seller через /start <seller_uuid>.

    SECURITY FIX (fail-closed): раньше в development при отсутствии
    TELEGRAM_WEBHOOK_SECRET эндпоинт оставался открыт — это позволяло фрод-webhook'ам
    привязывать chat_id к любому seller_id. Теперь без секрета всегда 500.
    (config.py в проде валит старт без этого env — это двойная защита.)
    """
    from app.telegram import send_message

    expected_secret = _os.environ.get("TELEGRAM_WEBHOOK_SECRET")
    if not expected_secret:
        raise HTTPException(500, "Server misconfigured: TELEGRAM_WEBHOOK_SECRET not set")
    if not x_telegram_bot_api_secret_token or not hmac.compare_digest(
        x_telegram_bot_api_secret_token, expected_secret
    ):
        raise HTTPException(403, "Forbidden")

    try:
        update = await request.json()
    except Exception:
        return {"ok": False}
    msg = update.get("message") or update.get("edited_message") or {}
    text = (msg.get("text") or "").strip()
    chat = msg.get("chat") or {}
    chat_id = str(chat.get("id") or "")
    if not chat_id or not text:
        return {"ok": True}
    if text.startswith("/start"):
        parts = text.split(maxsplit=1)
        if len(parts) == 2 and parts[1]:
            seller_id = parts[1].strip()
            if _UUID_RE.match(seller_id):
                try:
                    sb = get_supabase()
                    res = sb.table("sellers").update({
                        "telegram_chat_id": chat_id, "notify_telegram": True,
                    }).eq("id", seller_id).execute()
                    if res.data:
                        send_message(chat_id, "✅ <b>Telegram подключён!</b>\n\nТеперь вы будете получать ежедневный digest по важным уведомлениям.")
                        return {"ok": True, "linked": True}
                except Exception:
                    logger.exception("telegram linking failed", extra={"chat_id": chat_id})
        send_message(chat_id, "Привет! Я бот <b>Veloseller</b>. Чтобы подключить уведомления, откройте Veloseller и нажмите кнопку «Подключить Telegram» в настройках.")
        return {"ok": True, "linked": False}
    return {"ok": True}
