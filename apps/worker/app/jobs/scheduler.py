"""APScheduler: периодические задачи.

- recalc-all каждый час
- sync активных marketplace-connections РАЗ В СУТКИ в 02:00 UTC
- daily digest в 09:00 UTC

БАГ 30 fix: per-seller try/catch в _job_send_daily_digests + пагинация sellers
(раньше при ≥1000 sellers digest получали только первые 1000).
БАГ 31 fix: пагинация data_connections в _job_sync_active_connections.
"""
from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.config import settings
from app.db import fetch_all, get_supabase
from app.jobs.recalc import recalc_all_sellers
from app.schemas import SourceType
from app.sources import google_sheet, ozon, wildberries
from datetime import datetime, timezone

logger = logging.getLogger("veloseller.scheduler")

_scheduler: BackgroundScheduler | None = None


def _job_recalc_all() -> None:
    try:
        result = recalc_all_sellers()
        logger.info("Cron recalc-all done: %s", result)
    except Exception as e:
        logger.exception("Cron recalc-all failed: %s", e)


def _job_sync_active_connections() -> None:
    """Пинаем активные marketplace-connections (Ozon/WB/Google Sheet).

    БАГ 31 fix: пагинация через fetch_all — раньше при ≥1000 connections
    обрезалось.
    """
    from app.crypto import decrypt_if_encrypted
    try:
        sb = get_supabase()
        conns = fetch_all(
            sb.table("data_connections")
            .select("*")
            .eq("status", "active")
            .in_("source", ["google_sheet", "marketplace_api"])
        )
        logger.info("scheduler sync: %d active connections", len(conns))
        for conn in conns:
            cfg = conn.get("config") or {}
            try:
                if conn["source"] == "google_sheet":
                    snaps = google_sheet.fetch_snapshots(
                        cfg.get("sheet_url") or cfg.get("sheet_id"),
                        cfg.get("worksheet_index", 0),
                    )
                elif conn.get("marketplace") == "ozon":
                    client_id = decrypt_if_encrypted(cfg.get("client_id"))
                    api_key = decrypt_if_encrypted(cfg.get("api_key"))
                    snaps = ozon.fetch_snapshots(client_id, api_key)
                elif conn.get("marketplace") == "wildberries":
                    token = decrypt_if_encrypted(cfg.get("token") or cfg.get("api_key"))
                    snaps = wildberries.fetch_snapshots(token)
                else:
                    continue
                _persist_via_main(conn["seller_id"], conn["id"], conn["source"], snaps)
                sb.table("data_connections").update({
                    "last_sync_at": datetime.now(timezone.utc).isoformat(),
                    "status": "active",
                    "last_error": None,
                }).eq("id", conn["id"]).execute()
            except Exception as e:
                logger.exception("Sync failed for connection %s: %s", conn["id"], e)
                try:
                    sb.table("data_connections").update({
                        "last_sync_at": datetime.now(timezone.utc).isoformat(),
                        "status": "error",
                        "last_error": str(e)[:500],
                    }).eq("id", conn["id"]).execute()
                except Exception:
                    # Если даже статус не записался — не падаем, идём дальше
                    logger.exception("Failed to mark connection error", extra={"connection_id": conn["id"]})
    except Exception as e:
        logger.exception("Cron sync_active_connections failed: %s", e)


def _job_send_daily_digests() -> None:
    """Daily email + Telegram digest по непрочитанным alerts последних 24 часов.

    БАГ 30 fix: per-seller try/catch — один упавший email не прерывает digest
    для остальных. Также пагинация sellers через fetch_all (раньше при ≥1000
    sellers digest получали только первые 1000).
    """
    from datetime import timedelta
    from app.notifications import send_alert_digest
    from app.telegram import send_message as tg_send, format_alerts_digest
    try:
        sb = get_supabase()
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        sellers = fetch_all(
            sb.table("sellers").select("id,email,display_name,telegram_chat_id,notify_email,notify_telegram")
        )
        sent_email = 0
        sent_telegram = 0
        skipped = 0
        for s in sellers:
            try:
                # Подавляем пользователей, у которых обе нотификации выключены
                if not s.get("notify_email", True) and not s.get("notify_telegram", True):
                    skipped += 1
                    continue
                alerts = (
                    sb.table("alerts")
                    .select("kind,message,created_at,products(sku,product_name)")
                    .eq("seller_id", s["id"])
                    .is_("acknowledged_at", "null")
                    .gte("created_at", yesterday)
                    .order("created_at", desc=True)
                    .limit(50).execute()
                )
                if not alerts.data:
                    continue
                if s.get("email") and s.get("notify_email", True):
                    try:
                        if send_alert_digest(s["email"], s.get("display_name"), alerts.data):
                            sent_email += 1
                    except Exception:
                        logger.exception("Email digest failed for seller %s", s["id"])
                if s.get("telegram_chat_id") and s.get("notify_telegram", True):
                    try:
                        text = format_alerts_digest(alerts.data)
                        if text and tg_send(s["telegram_chat_id"], text):
                            sent_telegram += 1
                    except Exception:
                        logger.exception("Telegram digest failed for seller %s", s["id"])
            except Exception:
                logger.exception("Daily digest failed for seller %s", s.get("id"))
                continue
        logger.info("Daily digest job done", extra={
            "total_sellers": len(sellers),
            "sent_email": sent_email,
            "sent_telegram": sent_telegram,
            "skipped_optout": skipped,
        })
    except Exception as e:
        logger.exception("Daily digest job failed: %s", e)


def _persist_via_main(seller_id, connection_id, source_str, snapshots):
    """Импорт из main отложенный во избежание циклов."""
    from app.main import _persist_snapshots
    _persist_snapshots(seller_id, connection_id, SourceType(source_str), snapshots)


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(_job_recalc_all, CronTrigger(minute=5), id="recalc-all", replace_existing=True)
    _scheduler.add_job(
        _job_sync_active_connections,
        CronTrigger(hour=2, minute=0),
        id="sync-active-connections",
        replace_existing=True,
    )
    _scheduler.add_job(
        _job_send_daily_digests,
        CronTrigger(hour=9, minute=0),
        id="daily-digest",
        replace_existing=True,
    )
    _scheduler.start()


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
