"""Veloseller worker — FastAPI приложение."""
from __future__ import annotations

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
    SENSITIVE_KEYS = {"api_key", "token", "client_id", "password", "secret", "x-worker-secret",
                       "authorization", "stripe_subscription_id", "stripe_customer_id"}

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
    if not settings.worker_secret or settings.worker_secret == "dev-secret-replace-me":
        return
    if x_worker_secret != settings.worker_secret:
        raise HTTPException(401, "Invalid worker secret")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "ts": datetime.now(timezone.utc).isoformat()}


_PRODUCTS_IN_BATCH = 500
_INSERT_BATCH = 500
_DEDUP_WINDOW_HOURS = 20


def _ensure_products(sb, seller_id: str, snapshots: list[SnapshotInput]) -> dict[str, str]:
    if not snapshots:
        return {}
    rows = [{"seller_id": seller_id, "sku": s.sku, "product_name": s.product_name or s.sku} for s in snapshots]
    for i in range(0, len(rows), _PRODUCTS_IN_BATCH):
        sb.table("products").upsert(rows[i:i + _PRODUCTS_IN_BATCH], on_conflict="seller_id,sku").execute()

    all_skus = [s.sku for s in snapshots]
    sku_to_pid: dict[str, str] = {}
    for i in range(0, len(all_skus), _PRODUCTS_IN_BATCH):
        batch = all_skus[i:i + _PRODUCTS_IN_BATCH]
        res = (
            sb.table("products").select("product_id,sku").eq("seller_id", seller_id)
            .in_("sku", batch).execute()
        )
        for r in (res.data or []):
            sku_to_pid[r["sku"]] = r["product_id"]
    return sku_to_pid


def _persist_snapshots(seller_id, connection_id, source, snapshots):
    if not snapshots:
        return 0
    sb = get_supabase()
    sku_to_pid = _ensure_products(sb, seller_id, snapshots)

    unmapped_count = sum(1 for s in snapshots if s.sku not in sku_to_pid)
    if unmapped_count > 0:
        logger.warning("snapshots with unmapped SKUs", extra={
            "seller_id": seller_id, "unmapped": unmapped_count, "total": len(snapshots),
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


def _mark_connection_synced(sb, connection_id: str, error: Optional[str] = None) -> None:
    sb.table("data_connections").update({
        "last_sync_at": datetime.now(timezone.utc).isoformat(),
        "status": "error" if error else "active",
        "last_error": error,
    }).eq("id", connection_id).execute()


def _try_acquire_sync_lock(sb, connection_id: str) -> bool:
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


def _run_ozon_sync_bg(connection_id: str, seller_id: str, client_id: str, api_key: str) -> None:
    sb = get_supabase()
    try:
        snapshots = ozon.fetch_snapshots(client_id, api_key)
        inserted = _persist_snapshots(seller_id, connection_id, SourceType.MARKETPLACE_API, snapshots)
        _mark_connection_synced(sb, connection_id)
        logger.info("ozon synced (bg)", extra={"connection_id": connection_id, "inserted": inserted, "fetched_skus": len(snapshots)})
    except Exception as e:
        _mark_connection_synced(sb, connection_id, error=str(e)[:500])
        logger.exception("ozon sync failed (bg)", extra={"connection_id": connection_id})


def _run_wb_sync_bg(connection_id: str, seller_id: str, token: str) -> None:
    sb = get_supabase()
    try:
        snapshots = wildberries.fetch_snapshots(token)
        inserted = _persist_snapshots(seller_id, connection_id, SourceType.MARKETPLACE_API, snapshots)
        _mark_connection_synced(sb, connection_id)
        logger.info("wb synced (bg)", extra={"connection_id": connection_id, "inserted": inserted})
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
    if not _UUID_RE.match(seller_id or ""):
        raise HTTPException(400, "seller_id должен быть UUID")

    declared_size = getattr(file, "size", None)
    if declared_size is not None and declared_size > _CSV_MAX_SIZE_BYTES:
        raise HTTPException(
            413,
            f"Файл слишком большой: {declared_size} байт (максимум {_CSV_MAX_SIZE_BYTES})",
        )

    content = await file.read()
    if len(content) > _CSV_MAX_SIZE_BYTES:
        raise HTTPException(
            413,
            f"Файл слишком большой: {len(content)} байт (максимум {_CSV_MAX_SIZE_BYTES})",
        )

    try:
        snapshots = csv_upload.parse_csv(content)
    except Exception as e:
        logger.warning("csv parse failed", extra={"seller_id": seller_id, "error": str(e)})
        raise HTTPException(400, f"CSV parse error: {e}")
    inserted = _persist_snapshots(seller_id, None, SourceType.CSV_UPLOAD, snapshots)
    logger.info("csv ingested", extra={"seller_id": seller_id, "skus": len(snapshots), "inserted": inserted})
    return {"inserted": inserted, "skus": len(snapshots)}


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
        return {"started": False, "status": "running", "message": "Sync уже идёт"}
    background_tasks.add_task(
        _run_google_sheet_sync_bg, connection_id, conn.data["seller_id"], sheet, cfg.get("worksheet_index", 0)
    )
    logger.info("google sheet sync enqueued", extra={"connection_id": connection_id})
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
        return {"started": False, "status": "running", "message": "Sync уже идёт"}
    background_tasks.add_task(
        _run_ozon_sync_bg, connection_id, conn.data["seller_id"], client_id, api_key
    )
    logger.info("ozon sync enqueued", extra={"connection_id": connection_id})
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
        return {"started": False, "status": "running", "message": "Sync уже идёт"}
    background_tasks.add_task(_run_wb_sync_bg, connection_id, conn.data["seller_id"], token)
    logger.info("wb sync enqueued", extra={"connection_id": connection_id})
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
        return {"started": False, "status": "running", "message": "Sync уже идёт"}
    background_tasks.add_task(_run_feed_sync_bg, connection_id, conn.data["seller_id"], feed_url)
    logger.info("feed sync enqueued", extra={"connection_id": connection_id})
    return {"started": True, "status": "running", "message": "Sync запущен в фоне"}


def _run_recalc_bg(seller_id: str) -> None:
    progress: dict = {
        "phase": "starting",
        "processed": 0,
        "total": 0,
        "period_days": 30,
        "current_period_index": 0,
        "total_periods": 3,
    }
    _running_recalcs[seller_id] = {
        "started_at": datetime.now(timezone.utc).isoformat(),
        "status": "running",
        "result": None,
        "error": None,
        "progress": progress,
    }
    try:
        result = recalc_seller_all_periods(seller_id, progress=progress)
        _running_recalcs[seller_id].update({
            "status": "done",
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "result": result,
        })
        logger.info("recalc done (bg)", extra={"seller_id": seller_id, **{k: v for k, v in result.items() if isinstance(v, (int, float))}})
    except Exception as e:
        _running_recalcs[seller_id].update({
            "status": "error",
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "error": str(e)[:500],
        })
        logger.exception("recalc failed (bg)", extra={"seller_id": seller_id})


@app.post("/jobs/recalc/{seller_id}", dependencies=[Depends(require_worker_secret)])
def job_recalc_seller(seller_id: str, background_tasks: BackgroundTasks, sync: bool = False) -> dict:
    _cleanup_old_recalcs()

    existing = _running_recalcs.get(seller_id)
    if existing and existing.get("status") == "running":
        logger.info("recalc already running, skipping", extra={"seller_id": seller_id})
        return {
            "started": False,
            "status": "running",
            "started_at": existing.get("started_at"),
            "message": "Расчёт уже идёт, дождитесь завершения",
        }
    if sync:
        logger.info("recalc start (sync)", extra={"seller_id": seller_id})
        result = recalc_seller_all_periods(seller_id)
        logger.info("recalc done (sync)", extra={"seller_id": seller_id, **{k: v for k, v in result.items() if isinstance(v, (int, float))}})
        return result
    background_tasks.add_task(_run_recalc_bg, seller_id)
    logger.info("recalc enqueued (bg)", extra={"seller_id": seller_id})
    return {
        "started": True,
        "status": "running",
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
async def telegram_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: Optional[str] = Header(None),
) -> dict:
    from app.telegram import send_message

    expected_secret = _os.environ.get("TELEGRAM_WEBHOOK_SECRET")
    if expected_secret:
        if x_telegram_bot_api_secret_token != expected_secret:
            logger.warning("telegram webhook: invalid or missing secret token", extra={
                "got_header": bool(x_telegram_bot_api_secret_token),
            })
            raise HTTPException(403, "Forbidden")
    elif _os.environ.get("ENV", "development") == "production":
        logger.error("telegram webhook: TELEGRAM_WEBHOOK_SECRET not set in production")
        raise HTTPException(500, "Server misconfigured")

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
            if not _UUID_RE.match(seller_id):
                logger.warning("telegram /start with invalid seller_id format", extra={
                    "chat_id": chat_id,
                })
            else:
                try:
                    sb = get_supabase()
                    res = sb.table("sellers").update({
                        "telegram_chat_id": chat_id,
                        "notify_telegram": True,
                    }).eq("id", seller_id).execute()
                    if res.data:
                        send_message(chat_id,
                            "✅ <b>Telegram подключён!</b>\n\nТеперь вы будете получать ежедневный digest по важным уведомлениям.")
                        logger.info("telegram linked", extra={"seller_id": seller_id, "chat_id": chat_id})
                        return {"ok": True, "linked": True}
                except Exception:
                    logger.exception("telegram linking failed", extra={"chat_id": chat_id})
        send_message(chat_id,
            "Привет! Я бот <b>Veloseller</b>. Чтобы подключить уведомления, откройте Veloseller и нажмите кнопку «Подключить Telegram» в настройках.")
        return {"ok": True, "linked": False}
    return {"ok": True}
