"""Veloseller worker — FastAPI приложение."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile

from app.config import settings
from app.db import get_supabase
from app.jobs.recalc import recalc_all_sellers, recalc_seller, recalc_seller_all_periods
from app.jobs.scheduler import start_scheduler, stop_scheduler
from app.schemas import SnapshotInput, SourceType
from app.sources import csv_upload, feed as feed_src, google_sheet, ozon, wildberries

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("veloseller.worker")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Запуск APScheduler при старте, остановка при shutdown."""
    if settings.enable_scheduler:
        start_scheduler()
        logger.info("APScheduler started")
    yield
    if settings.enable_scheduler:
        stop_scheduler()


app = FastAPI(title="Veloseller Worker", version="0.1.0", lifespan=lifespan)


def require_worker_secret(x_worker_secret: Optional[str] = Header(None)) -> None:
    if not settings.worker_secret or settings.worker_secret == "dev-secret-replace-me":
        return  # dev mode
    if x_worker_secret != settings.worker_secret:
        raise HTTPException(401, "Invalid worker secret")


# ============================================================================
# Health
# ============================================================================

@app.get("/health")
def health() -> dict:
    return {"status": "ok", "ts": datetime.now(timezone.utc).isoformat()}


# ============================================================================
# Persistence helpers
# ============================================================================

def _ensure_products(sb, seller_id: str, snapshots: list[SnapshotInput]) -> dict[str, str]:
    if not snapshots:
        return {}
    rows = [
        {"seller_id": seller_id, "sku": s.sku, "product_name": s.product_name or s.sku}
        for s in snapshots
    ]
    sb.table("products").upsert(rows, on_conflict="seller_id,sku").execute()
    res = (
        sb.table("products")
        .select("product_id,sku")
        .eq("seller_id", seller_id)
        .in_("sku", [s.sku for s in snapshots])
        .execute()
    )
    return {r["sku"]: r["product_id"] for r in (res.data or [])}


def _persist_snapshots(
    seller_id: str,
    connection_id: Optional[str],
    source: SourceType,
    snapshots: list[SnapshotInput],
) -> int:
    if not snapshots:
        return 0
    sb = get_supabase()
    sku_to_pid = _ensure_products(sb, seller_id, snapshots)

    rows = []
    for s in snapshots:
        pid = sku_to_pid.get(s.sku)
        if not pid:
            continue
        ts = s.snapshot_time or datetime.now(timezone.utc)
        rows.append({
            "product_id": pid,
            "connection_id": connection_id,
            "stock_quantity": s.stock_quantity,
            "price": float(s.price),
            "availability": s.stock_quantity > 0,
            "snapshot_time": ts.isoformat(),
            "source": source.value,
        })

    if rows:
        sb.table("inventory_snapshots").insert(rows).execute()
    return len(rows)


def _mark_connection_synced(sb, connection_id: str, error: Optional[str] = None) -> None:
    sb.table("data_connections").update({
        "last_sync_at": datetime.now(timezone.utc).isoformat(),
        "status": "error" if error else "active",
        "last_error": error,
    }).eq("id", connection_id).execute()


# ============================================================================
# Ingest endpoints
# ============================================================================

@app.post("/ingest/csv", dependencies=[Depends(require_worker_secret)])
async def ingest_csv(seller_id: str, file: UploadFile = File(...)) -> dict:
    content = await file.read()
    try:
        snapshots = csv_upload.parse_csv(content)
    except Exception as e:
        raise HTTPException(400, f"CSV parse error: {e}")
    inserted = _persist_snapshots(seller_id, None, SourceType.CSV_UPLOAD, snapshots)
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
    except Exception as e:
        _mark_connection_synced(sb, connection_id, error=str(e)[:500])
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
    except Exception as e:
        _mark_connection_synced(sb, connection_id, error=str(e)[:500])
        raise HTTPException(500, f"Ozon sync error: {e}")
    return {"inserted": inserted}


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
    except Exception as e:
        _mark_connection_synced(sb, connection_id, error=str(e)[:500])
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
    except Exception as e:
        _mark_connection_synced(sb, connection_id, error=str(e)[:500])
        raise HTTPException(500, f"Feed sync error: {e}")
    return {"inserted": inserted}


# ============================================================================
# Recalc jobs
# ============================================================================

@app.post("/jobs/recalc/{seller_id}", dependencies=[Depends(require_worker_secret)])
def job_recalc_seller(seller_id: str, period_days: int = 30) -> dict:
    return recalc_seller(seller_id, period_days)


@app.post("/jobs/recalc-all", dependencies=[Depends(require_worker_secret)])
def job_recalc_all() -> dict:
    return recalc_all_sellers()



# ============================================================================
# Telegram webhook — обработка /start <seller_id> deeplink
# ============================================================================

@app.post("/telegram/webhook")
async def telegram_webhook(request: Request) -> dict:
    """Telegram Bot API webhook. Обрабатывает /start <seller_id> deeplink."""
    from app.telegram import send_message

    # Парсим body
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

    # /start <seller_id>
    if text.startswith("/start"):
        parts = text.split(maxsplit=1)
        if len(parts) == 2 and parts[1]:
            seller_id = parts[1].strip()
            try:
                sb = get_supabase()
                res = sb.table("sellers").update({
                    "telegram_chat_id": chat_id,
                    "notify_telegram": True,
                }).eq("id", seller_id).execute()
                if res.data:
                    send_message(chat_id,
                        "✅ <b>Telegram подключён!</b>\n\nТеперь вы будете получать ежедневный digest по важным уведомлениям.")
                    return {"ok": True, "linked": True}
            except Exception as e:
                logger.exception("Telegram linking error: %s", e)
        send_message(chat_id,
            "Привет! Я бот <b>Veloseller</b>. Чтобы подключить уведомления, откройте Veloseller и нажмите кнопку «Подключить Telegram» в настройках.")
        return {"ok": True, "linked": False}

    return {"ok": True}
