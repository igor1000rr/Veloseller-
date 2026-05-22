"""APScheduler: периодические задачи.

- recalc-all каждый час
- sync активных marketplace-connections РАЗ В СУТКИ в 02:00 UTC
- expire-subscriptions в 03:00 UTC (откатываем в trial истёкшие платные подписки)
- daily-reports в 09:00 UTC (этап 2 алерты→отчёты — диспетчер по day_of_week)
- snapshots retention в 04:00 UTC (БАГ 89)
- reset stuck syncing каждые 10 минут (БАГ 90)

Старые джобы daily-digest и weekly-report удалены — их функциял
выполняет универсальный daily-reports через notification_subscriptions.
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

_SNAPSHOTS_RETENTION_DAYS = 180
_STUCK_SYNCING_TIMEOUT_MINUTES = 30

# Лимит складов для trial-плана (при откате из истёкшей подписки)
_TRIAL_WAREHOUSES_LIMIT = 15


def _job_recalc_all() -> None:
    try:
        result = recalc_all_sellers()
        logger.info("Cron recalc-all done: %s", result)
    except Exception as e:
        logger.exception("Cron recalc-all failed: %s", e)


def _job_sync_active_connections() -> None:
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


def _job_expire_subscriptions() -> None:
    """Откатывает истёкшие платные подписки в trial."""
    try:
        sb = get_supabase()
        now_iso = datetime.now(timezone.utc).isoformat()
        expired_res = (
            sb.table("sellers")
            .select("id,email,plan,subscription_expires_at")
            .neq("plan", "trial")
            .not_.is_("subscription_expires_at", "null")
            .lt("subscription_expires_at", now_iso)
            .execute()
        )
        expired = expired_res.data or []
        if not expired:
            logger.info("expire-subscriptions: nothing to expire")
            return
        for s in expired:
            try:
                sb.table("sellers").update({
                    "plan": "trial",
                    "plan_warehouses_limit": _TRIAL_WAREHOUSES_LIMIT,
                    "subscription_expires_at": None,
                }).eq("id", s["id"]).execute()
                logger.info("subscription expired → trial", extra={
                    "seller_id": s["id"],
                    "email": s.get("email"),
                    "prev_plan": s.get("plan"),
                })
            except Exception:
                logger.exception("failed to expire subscription for %s", s.get("id"))
        logger.warning("expire-subscriptions: rolled back %d sellers to trial", len(expired))
    except Exception:
        logger.exception("expire-subscriptions job failed")


def _job_daily_reports() -> None:
    """Каждый день 09:00 UTC — диспетчер Excel-отчётов.

    См. apps/worker/app/jobs/reports.py: по каждому seller собирает включённые
    подписки с params.day_of_week == сегодня, строит один XLSX с листами по kinds,
    отправляет через email/telegram, пишет в report_history.
    """
    try:
        from app.jobs.reports import dispatch_daily_reports
        dispatch_daily_reports()
    except Exception:
        logger.exception("daily-reports scheduler job failed")


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
    """БАГ 90: сбрасываем connections в status='syncing' старше N минут в 'error'."""
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
        _job_expire_subscriptions,
        CronTrigger(hour=3, minute=0),
        id="expire-subscriptions",
        replace_existing=True,
    )
    _scheduler.add_job(
        _job_snapshots_retention,
        CronTrigger(hour=4, minute=0),
        id="snapshots-retention",
        replace_existing=True,
    )
    # Этап 2 «алерты → отчёты»: ежедневный диспетчер. Отбирает подписки
    # с params.day_of_week == isoweekday(today). Приходят 09:00 UTC = 12:00 МСК.
    _scheduler.add_job(
        _job_daily_reports,
        CronTrigger(hour=9, minute=0),
        id="daily-reports",
        replace_existing=True,
    )
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
