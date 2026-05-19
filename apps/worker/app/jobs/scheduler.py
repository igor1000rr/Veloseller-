"""APScheduler: периодические задачи.

- recalc-all каждый час (без новых snapshot'ов это дёшево)
- sync активных marketplace-connections РАЗ В СУТКИ в 02:00 UTC (05:00 Moscow)
  Раньше было каждые 6 часов = 4 раза в сутки, создавалось 4× мусорных snapshot'ов
  с одинаковыми stock'ами. Дедупликация на ingest решает проблему, но 1 раз в сутки
  тоже даёт чистый сигнал и экономит rate limits API маркетплейсов.
- daily digest в 09:00 UTC
"""
from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.config import settings
from app.db import get_supabase
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

    Запускается 1 раз в сутки в 02:00 UTC. Раньше было 4 раза в сутки, что создавало
    избыточные snapshot'ы (stock между синками обычно не меняется).
    """
    from app.crypto import decrypt_if_encrypted
    try:
        sb = get_supabase()
        conns = (
            sb.table("data_connections")
            .select("*")
            .eq("status", "active")
            .in_("source", ["google_sheet", "marketplace_api"])
            .execute()
        )
        for conn in (conns.data or []):
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
                sb.table("data_connections").update({
                    "last_sync_at": datetime.now(timezone.utc).isoformat(),
                    "status": "error",
                    "last_error": str(e)[:500],
                }).eq("id", conn["id"]).execute()
    except Exception as e:
        logger.exception("Cron sync_active_connections failed: %s", e)


def _job_send_daily_digests() -> None:
    """Daily email + Telegram digest по непрочитанным alerts последних 24 часов."""
    from datetime import timedelta
    from app.notifications import send_alert_digest
    from app.telegram import send_message as tg_send, format_alerts_digest
    try:
        sb = get_supabase()
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        sellers = sb.table("sellers").select("id,email,display_name,telegram_chat_id,notify_email,notify_telegram").execute()
        for s in (sellers.data or []):
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
                send_alert_digest(s["email"], s.get("display_name"), alerts.data)
            if s.get("telegram_chat_id") and s.get("notify_telegram", True):
                text = format_alerts_digest(alerts.data)
                if text:
                    tg_send(s["telegram_chat_id"], text)
        logger.info("Daily digest job done")
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
    # Каждый час в HH:05 — recalc (без новых snapshot'ов это дёшево, обновляются метрики)
    _scheduler.add_job(_job_recalc_all, CronTrigger(minute=5), id="recalc-all", replace_existing=True)
    # РАЗ В СУТКИ в 02:00 UTC (05:00 Moscow) — sync connections.
    # Раньше каждые 6 часов = 4× мусорных snapshot'ов в день.
    _scheduler.add_job(
        _job_sync_active_connections,
        CronTrigger(hour=2, minute=0),
        id="sync-active-connections",
        replace_existing=True,
    )
    # Ежедневный email-digest в 09:00 UTC
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
