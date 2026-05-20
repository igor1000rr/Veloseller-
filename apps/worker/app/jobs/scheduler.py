"""APScheduler: периодические задачи.

- recalc-all каждый час
- sync активных marketplace-connections РАЗ В СУТКИ в 02:00 UTC
- daily digest в 09:00 UTC
- snapshots retention в 04:00 UTC (БАГ 89)
- reset stuck syncing каждые 10 минут (БАГ 90)
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
from datetime import datetime, timedelta, timezone

logger = logging.getLogger("veloseller.scheduler")

_scheduler: BackgroundScheduler | None = None

# БАГ 89: глубина истории inventory_snapshots.
# Engine берёт: 90-day period + 30-day pre-period для медианы = 120 дней.
# Запас 60 дней → 180 дней.
_SNAPSHOTS_RETENTION_DAYS = 180

# БАГ 90: максимум времени в status='syncing'. Если connection в syncing дольше этого —
# worker упал/рестартнул. Сбрасываем в error чтобы UI не ждал вечно.
_STUCK_SYNCING_TIMEOUT_MINUTES = 30


def _job_recalc_all() -> None:
    try:
        result = recalc_all_sellers()
        logger.info("Cron recalc-all done: %s", result)
    except Exception as e:
        logger.exception("Cron recalc-all failed: %s", e)


def _job_sync_active_connections() -> None:
    """Пинаем активные marketplace-connections раз в сутки.

    БАГ 31: пагинация connections.
    БАГ 87/90: фильтр по status='active' автоматически пропускает connections в 'syncing'
    или 'error' — избегаем double-sync race.
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
                    logger.exception("Failed to mark connection error", extra={"connection_id": conn["id"]})
    except Exception as e:
        logger.exception("Cron sync_active_connections failed: %s", e)


def _job_send_daily_digests() -> None:
    """Daily email + Telegram digest по непрочитанным alerts последних 24 часов."""
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


def _job_snapshots_retention() -> None:
    """БАГ 89: удаляем inventory_snapshots старше 180 дней."""
    try:
        sb = get_supabase()
        cutoff = (datetime.now(timezone.utc) - timedelta(days=_SNAPSHOTS_RETENTION_DAYS)).isoformat()
        count_q = sb.table("inventory_snapshots").select("snapshot_id", count="exact").lt(
            "snapshot_time", cutoff
        ).limit(1).execute()
        to_delete = getattr(count_q, "count", None) or 0
        if to_delete == 0:
            logger.info("snapshots retention: nothing to delete")
            return
        sb.table("inventory_snapshots").delete().lt("snapshot_time", cutoff).execute()
        logger.info("snapshots retention: deleted %d rows older than %d days",
                    to_delete, _SNAPSHOTS_RETENTION_DAYS)
    except Exception as e:
        logger.exception("snapshots retention job failed: %s", e)


def _job_reset_stuck_syncing() -> None:
    """БАГ 90: сбрасываем connections в status='syncing' старше N минут в 'error'.

    Сценарий: worker restart (systemctl, OOM, deploy) во время BG sync.
    BG task теряется, status='syncing' остаётся навсегда, UI поллит вечно.
    Этот job исправляет в течении 30 минут.

    Ориентируемся по updated_at (триггер trg_data_connections_updated_at выставляет
    его при любом UPDATE — включая наш "возьми лок" UPDATE status='syncing').
    """
    try:
        sb = get_supabase()
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=_STUCK_SYNCING_TIMEOUT_MINUTES)).isoformat()
        stuck = (
            sb.table("data_connections")
            .select("id,name,updated_at")
            .eq("status", "syncing")
            .lt("updated_at", cutoff)
            .execute()
        )
        rows = stuck.data or []
        if not rows:
            return
        for conn in rows:
            try:
                sb.table("data_connections").update({
                    "status": "error",
                    "last_error": f"Sync прерван (worker restart или timeout >{_STUCK_SYNCING_TIMEOUT_MINUTES} мин)",
                    "last_sync_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", conn["id"]).execute()
            except Exception:
                logger.exception("Failed to reset stuck syncing", extra={"connection_id": conn["id"]})
        logger.warning("reset stuck syncing connections", extra={"count": len(rows)})
    except Exception:
        logger.exception("reset stuck syncing job failed")


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
        _job_snapshots_retention,
        CronTrigger(hour=4, minute=0),
        id="snapshots-retention",
        replace_existing=True,
    )
    _scheduler.add_job(
        _job_send_daily_digests,
        CronTrigger(hour=9, minute=0),
        id="daily-digest",
        replace_existing=True,
    )
    # БАГ 90: каждые 10 минут сбрасываем застрявшие syncing
    _scheduler.add_job(
        _job_reset_stuck_syncing,
        CronTrigger(minute="*/10"),
        id="reset-stuck-syncing",
        replace_existing=True,
    )
    _scheduler.start()


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
