"""Veloseller worker — FastAPI приложение."""
from __future__ import annotations

import logging
import re
from contextlib import asynccontextmanager
from datetime import datetime, timezone
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
_sentry_dsn = _os.environ.get("SENTRY_DSN")
if _sentry_dsn:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration
        sentry_sdk.init(
            dsn=_sentry_dsn,
            integrations=[
                FastApiIntegration(),
                LoggingIntegration(level=logging.INFO, event_level=logging.ERROR),
            ],
            environment=_os.environ.get("SENTRY_ENV", "production"),
            traces_sample_rate=0.1,
            release=_os.environ.get("SENTRY_RELEASE"),
        )
        logger.info("sentry initialized", extra={"env": _os.environ.get("SENTRY_ENV", "production")})
    except ImportError:
        logger.warning("SENTRY_DSN set but sentry-sdk not installed — skipping")


_running_recalcs: dict[str, dict] = {}

# БАГ 52: UUID regex для валидации seller_id из Telegram /start payload.
_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)


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


# Максимум SKU в одном `.in_(...)` запросе. PostgREST URL лимит ~8KB.
# При средней длине sku 12 символов + JSON-escape, 500 SKU = ~7KB URL — безопасно.
_PRODUCTS_IN_BATCH = 500


def _ensure_products(sb, seller_id: str, snapshots: list[SnapshotInput]) -> dict[str, str]:
    """Upsert products и возвращает маппинг sku -> product_id.

    БАГ 15 fix: батчируем `.in_("sku", [...])` по 500 SKU. Раньше при 1879 SKU
    URL был ~22KB > PostgREST лимита 8KB, запрос обрезался и часть SKU не возвращалась.
    Это приводило к тому что 436 SKU создавались через upsert, но их snapshot'ы пропускались
    в _persist_snapshots (потому что pid=None после неполного маппинга).
    """
    if not snapshots:
        return {}
    rows = [{"seller_id": seller_id, "sku": s.sku, "product_name": s.product_name or s.sku} for s in snapshots]
    sb.table("products").upsert(rows, on_conflict="seller_id,sku").execute()

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
    """Сохраняет snapshot'ы с дедупликацией."""
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
        from datetime import timedelta
        cutoff = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
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
        sb.table("inventory_snapshots").insert(rows).execute()
    logger.info("snapshots persisted", extra={
        "seller_id": seller_id, "connection_id": connection_id,
        "inserted": len(rows), "skipped_duplicates": skipped_duplicates,
        "skipped_unmapped": skipped_unmapped, "total_skus": len(snapshots),
    })
    return len(rows)


def _mark_connection_synced(sb, connection_id: str, error: Optional[str] = None) -> None:
    sb.table("data_connections").update({
        "last_sync_at": datetime.now(timezone.utc).isoformat(),
        "status": "error" if error else "active",
        "last_error": error,
    }).eq("id", connection_id).execute()


@app.post("/ingest/csv", dependencies=[Depends(require_worker_secret)])
async def ingest_csv(seller_id: str, file: UploadFile = File(...)) -> dict:
    content = await file.read()
    try:
        snapshots = csv_upload.parse_csv(content)
    except Exception as e:
        logger.warning("csv parse failed", extra={"seller_id": seller_id, "error": str(e)})
        raise HTTPException(400, f"CSV parse error: {e}")
    inserted = _persist_snapshots(seller_id, None, SourceType.CSV_UPLOAD, snapshots)
    logger.info("csv ingested", extra={"seller_id": seller_id, "skus": len(snapshots), "inserted": inserted})
    return {"inserted": inserted, "skus": len(snapshots)}


@app.post("/ingest/google-sheet/{connection_id}", dependencies=[Depends(require_worker_secret)])
def ingest_google_sheet(connection_id: str) -> dict:
    sb = get_supabase()
    conn = sb.table("data_connections").select("*").eq("id", connection_id).single().execute()
    if not conn.data:
        raise HTTPException(404, "Connection not found")
    cfg = conn.data.get("config") or {}
    sheet = cfg.get("sheet_url") or cfg.get("sheet_id")
    if not sheet:
        raise HTTPException(400, "config.sheet_url или config.sheet_id обязателен")
    try:
        snapshots = google_sheet.fetch_snapshots(sheet, cfg.get("worksheet_index", 0))
        inserted = _persist_snapshots(conn.data["seller_id"], connection_id, SourceType.GOOGLE_SHEET, snapshots)
        _mark_connection_synced(sb, connection_id)
        logger.info("google sheet synced", extra={"connection_id": connection_id, "inserted": inserted})
    except Exception as e:
        _mark_connection_synced(sb, connection_id, error=str(e)[:500])
        logger.exception("google sheet sync failed", extra={"connection_id": connection_id})
        raise HTTPException(500, f"Google Sheet sync error: {e}")
    return {"inserted": inserted}


@app.post("/ingest/ozon/{connection_id}", dependencies=[Depends(require_worker_secret)])
def ingest_ozon(connection_id: str) -> dict:
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
    try:
        snapshots = ozon.fetch_snapshots(client_id, api_key)
        inserted = _persist_snapshots(conn.data["seller_id"], connection_id, SourceType.MARKETPLACE_API, snapshots)
        _mark_connection_synced(sb, connection_id)
        logger.info("ozon synced", extra={"connection_id": connection_id, "inserted": inserted, "fetched_skus": len(snapshots)})
    except Exception as e:
        _mark_connection_synced(sb, connection_id, error=str(e)[:500])
        logger.exception("ozon sync failed", extra={"connection_id": connection_id})
        raise HTTPException(500, f"Ozon sync error: {e}")
    return {"inserted": inserted, "fetched_skus": len(snapshots)}


@app.post("/ingest/wb/{connection_id}", dependencies=[Depends(require_worker_secret)])
def ingest_wb(connection_id: str) -> dict:
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
    try:
        snapshots = wildberries.fetch_snapshots(token)
        inserted = _persist_snapshots(conn.data["seller_id"], connection_id, SourceType.MARKETPLACE_API, snapshots)
        _mark_connection_synced(sb, connection_id)
        logger.info("wb synced", extra={"connection_id": connection_id, "inserted": inserted})
    except Exception as e:
        _mark_connection_synced(sb, connection_id, error=str(e)[:500])
        logger.exception("wb sync failed", extra={"connection_id": connection_id})
        raise HTTPException(500, f"WB sync error: {e}")
    return {"inserted": inserted}


@app.post("/ingest/feed/{connection_id}", dependencies=[Depends(require_worker_secret)])
def ingest_feed(connection_id: str) -> dict:
    sb = get_supabase()
    conn = sb.table("data_connections").select("*").eq("id", connection_id).single().execute()
    if not conn.data:
        raise HTTPException(404, "Connection not found")
    cfg = conn.data.get("config") or {}
    feed_url = cfg.get("feed_url")
    if not feed_url:
        raise HTTPException(400, "config.feed_url обязателен")
    try:
        snapshots = feed_src.fetch_snapshots(feed_url)
        inserted = _persist_snapshots(conn.data["seller_id"], connection_id, SourceType.FEED, snapshots)
        _mark_connection_synced(sb, connection_id)
        logger.info("feed synced", extra={"connection_id": connection_id, "inserted": inserted})
    except Exception as e:
        _mark_connection_synced(sb, connection_id, error=str(e)[:500])
        logger.exception("feed sync failed", extra={"connection_id": connection_id})
        raise HTTPException(500, f"Feed sync error: {e}")
    return {"inserted": inserted}


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
    """Telegram webhook handler.

    БАГ 52 fix (КРИТИЧНО): проверяем X-Telegram-Bot-Api-Secret-Token header.
    Раньше любой мог послать POST с /start <victim_seller_id> и привязать свой chat_id
    к чужому аккаунту, получая все уведомления жертвы.

    Telegram отправляет этот header, если webhook был зарегистрирован с secret_token:
      curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook \
        -d url=https://veloseller.ru/api/telegram/webhook \
        -d secret_token=<RANDOM_32_CHARS>

    Также добавлена UUID-валидация seller_id чтобы не делать DB-запросы с мусором.
    """
    from app.telegram import send_message

    # БАГ 52 fix: верификация что запрос реально от Telegram.
    expected_secret = _os.environ.get("TELEGRAM_WEBHOOK_SECRET")
    if expected_secret:
        if x_telegram_bot_api_secret_token != expected_secret:
            logger.warning("telegram webhook: invalid or missing secret token", extra={
                "got_header": bool(x_telegram_bot_api_secret_token),
            })
            raise HTTPException(403, "Forbidden")
    # Если secret не задан — пропускаем (dev режим), но логируем предупреждение
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
            # БАГ 52: валидация UUID — не делаем DB-запросы с произвольным мусором
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
