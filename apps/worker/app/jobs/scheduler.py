"""APScheduler: периодические задачи.

- recalc-all РАЗ В СУТКИ в 02:40 UTC (после ночного sync; до 05.06.2026 бежал
  каждый час и генерировал ~90% REST-вызовов к Supabase впустую — данные
  меняются раз в сутки, recalc после ручных синков вызывается отдельно из main)
- sync активных marketplace-connections РАЗ В СУТКИ в 02:00 UTC
- retry-transient-errors каждые 5 минут (авто-повтор синка при временных
  ошибках: лимит WB, 5xx, сеть — жёсткие ошибки токен/прав НЕ ретрайм)
- expire-subscriptions в 03:00 UTC (откатываем в trial истёкшие платные подписки)
- daily-reports в 09:00 UTC (этап 2 алерты→отчёты — диспетчер по day_of_week)
- monthly-reports 1-го числа в 09:30 UTC (управленческий PDF за прошлый месяц)
- snapshots retention в 04:00 UTC (БАГ 89)
- metrics retention в 04:30 UTC (инцидент DB Size 05.06.2026)
- reset stuck syncing каждые 10 минут (БАГ 90)
- radar-poll в 06:00 UTC ежедневно (Wordstat poll для approved брендов + suggest)
- radar-digest пн+чт в 09:00 UTC (Telegram дайджест по новинкам)

Старые джобы daily-digest и weekly-report удалены — их функционал
выполняет универсальный daily-reports через notification_subscriptions.
"""
from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.config import settings
from app.db import execute_minimal, fetch_all, get_supabase
from app.jobs.recalc import recalc_all_sellers
from app.schemas import SourceType
from app.sources import google_sheet, ozon, shopify, wildberries
from datetime import date, datetime, timedelta, timezone

logger = logging.getLogger("veloseller.scheduler")

_scheduler: BackgroundScheduler | None = None

_SNAPSHOTS_RETENTION_DAYS = 180
_STUCK_SYNCING_TIMEOUT_MINUTES = 30

# Retention метрик (инцидент 05.06.2026, DB Size 82% на Free-тарифе):
# - tvelo_metrics: ключ (product, period_start, period_end) со скользящими
#   датами — каждый день upsert создаёт НОВЫЕ строки (~17К/день), вчерашние
#   никем не читаются. Храним недельный хвост.
# - changelog / inventory_events: recalc перезаписывает только последние
#   90 дней; всё старше 100 дней — мёртвый осадок.
_TVELO_RETENTION_DAYS = 7
_EVENTS_RETENTION_DAYS = 100

# Лимит складов для trial-плана (при откате из истёкшей подписки)
_TRIAL_WAREHOUSES_LIMIT = 15

# Авто-повтор временных ошибок синка. Окно по возрасту last_sync_at:
# - не раньше 2 мин после последней попытки (даём лимиту WB остыть и не
#   гонимся за только что упавшим ручным синком);
# - не позже 6 часов (если «временная» ошибка висит полдня — это уже не
#   временная, ждём ночной крон / ручное вмешательство).
_TRANSIENT_RETRY_MIN_AGE_MINUTES = 2
_TRANSIENT_RETRY_MAX_AGE_HOURS = 6


def _job_recalc_all() -> None:
    try:
        result = recalc_all_sellers()
        logger.info("Cron recalc-all done: %s", result)
    except Exception as e:
        logger.exception("Cron recalc-all failed: %s", e)


def _run_connection_sync(sb, conn) -> None:
    """Один проход синка для connection: fetch → persist → пометить active.

    Бросает исключение при ошибке (вызывающий помечает status=error). Общий
    для ночного sync-active и для retry-transient-errors — чтобы логика
    ветвления по источнику/складу жила в одном месте.
    """
    from app.crypto import decrypt_if_encrypted
    cfg = conn.get("config") or {}
    if conn["source"] == "google_sheet":
        snaps = google_sheet.fetch_snapshots(
            cfg.get("sheet_url") or cfg.get("sheet_id"),
            cfg.get("worksheet_index", 0),
        )
    elif conn.get("marketplace") == "ozon":
        client_id = decrypt_if_encrypted(cfg.get("client_id"))
        api_key = decrypt_if_encrypted(cfg.get("api_key"))
        # 04.06.2026: крон звал fetch_snapshots БЕЗ kind — оба ozon-склада
        # каждую ночь перезаписывались СУММОЙ всех типов остатков
        # (вторая причина «FBO и FBS одинаковые»). Маппинг дублирует
        # main._ozon_kind_from_warehouse — импорт из main дал бы цикл.
        warehouse_kind = conn.get("warehouse_kind")
        if warehouse_kind == "ozon_fbo":
            kind = "fbo"
        elif warehouse_kind == "ozon_fbs":
            kind = "fbs"
        else:
            kind = None
        snaps = ozon.fetch_snapshots(client_id, api_key, kind=kind)
    elif conn.get("marketplace") == "wildberries":
        token = decrypt_if_encrypted(cfg.get("token") or cfg.get("api_key"))
        # 04.06.2026: тот же класс бага — крон игнорировал wb_fbs и писал
        # в fbs-склад FBO-остатки. Ветвление как в main._run_wb_sync_bg.
        if conn.get("warehouse_kind") == "wb_fbs":
            snaps = wildberries.fetch_fbs_snapshots(token)
        else:
            snaps = wildberries.fetch_snapshots(token)
    elif conn.get("marketplace") == "shopify":
        # .com: Shopify Admin GraphQL. Токен шифруется как ozon/wb,
        # shop — плейнтекст. Ветвление как в main._run_shopify_sync_bg.
        shop = cfg.get("shop") or cfg.get("shop_domain")
        access_token = decrypt_if_encrypted(cfg.get("access_token"))
        snaps = shopify.fetch_snapshots(shop, access_token)
    else:
        # Неизвестный источник — ничего не делаем (как старый continue).
        return
    _persist_via_main(conn["seller_id"], conn["id"], conn["source"], snaps)
    sb.table("data_connections").update({
        "last_sync_at": datetime.now(timezone.utc).isoformat(),
        "status": "active",
        "last_error": None,
        "failure_count": 0,
    }).eq("id", conn["id"]).execute()


def _mark_connection_error(sb, conn, err) -> None:
    try:
        sb.table("data_connections").update({
            "last_sync_at": datetime.now(timezone.utc).isoformat(),
            "status": "error",
            "last_error": str(err)[:500],
        }).eq("id", conn["id"]).execute()
    except Exception:
        logger.exception("Failed to mark connection error", extra={"connection_id": conn["id"]})


def _job_sync_active_connections() -> None:
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
            try:
                _run_connection_sync(sb, conn)
            except Exception as e:
                logger.exception("Sync failed for connection %s: %s", conn["id"], e)
                _mark_connection_error(sb, conn, e)
    except Exception as e:
        logger.exception("Cron sync_active_connections failed: %s", e)


def _is_transient_sync_error(msg) -> bool:
    """Временная ли ошибка синка (имеет смысл авто-повтор).

    rate-limit (429, WB Statistics API 1 req/60s), 5xx маркетплейса, сеть/timeout.
    Жёсткие (401/403 токен/права, валидация) сюда НЕ попадают — повтор с теми
    же кривыми ключами бесполезен.
    """
    if not msg:
        return False
    m = str(msg).lower()
    markers = (
        "429", "too many requests", "rate limit",
        "502", "503", "504", "bad gateway", "service unavailable",
        "timeout", "timed out", "econnrefused", "temporarily",
    )
    return any(marker in m for marker in markers)


def _job_retry_transient_errors() -> None:
    """Каждые 5 минут — авто-повтор складов в status='error' с ВРЕМЕННОЙ ошибкой.

    Цель: юзеру не нужно жать «Синхронизировать» вручную после лимита WB —
    обновление подхватится само. Ночной sync-active берёт только active и
    склады в ошибке пропускает, поэтому без этой джобы временная ошибка
    висела бы до ручного успешного синка.

    paused-склады (3 неудачи подряд) СЮДА НЕ попадают — только status='error'.
    Окно по возрасту (2 мин..6 ч) ограничивает частоту и не даёт долбиться
    в персистентную проблему бесконечно.
    """
    try:
        sb = get_supabase()
        now = datetime.now(timezone.utc)
        min_age = (now - timedelta(minutes=_TRANSIENT_RETRY_MIN_AGE_MINUTES)).isoformat()
        max_age = (now - timedelta(hours=_TRANSIENT_RETRY_MAX_AGE_HOURS)).isoformat()
        conns = fetch_all(
            sb.table("data_connections")
            .select("*")
            .eq("status", "error")
            .in_("source", ["google_sheet", "marketplace_api"])
            .lt("last_sync_at", min_age)
            .gt("last_sync_at", max_age)
        )
        retryable = [c for c in conns if _is_transient_sync_error(c.get("last_error"))]
        if not retryable:
            return
        logger.info("transient-retry: %d connections", len(retryable))
        for conn in retryable:
            try:
                _run_connection_sync(sb, conn)
                logger.info("transient-retry ok", extra={"connection_id": conn["id"]})
            except Exception as e:
                logger.warning("transient-retry still failing %s: %s", conn["id"], e)
                _mark_connection_error(sb, conn, e)
    except Exception:
        logger.exception("retry transient errors job failed")


def _job_expire_subscriptions() -> None:
    """Откатывает истёкшие платные подписки в trial.

    Также откатывает истёкшие Radar-подписки (radar_active_until < now)
    в radar_plan='none', сохраняя radar_trial_started_at чтобы юзер
    не мог получить ещё один trial.
    """
    try:
        sb = get_supabase()
        now_iso = datetime.now(timezone.utc).isoformat()

        # 1. Veloseller подписки
        expired_res = (
            sb.table("sellers")
            .select("id,email,plan,subscription_expires_at")
            .neq("plan", "trial")
            .not_.is_("subscription_expires_at", "null")
            .lt("subscription_expires_at", now_iso)
            .execute()
        )
        expired = expired_res.data or []
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
        if expired:
            logger.warning("expire-subscriptions: rolled back %d sellers to trial", len(expired))

        # 2. Radar подписки
        expired_radar_res = (
            sb.table("sellers")
            .select("id,email,radar_plan,radar_active_until")
            .neq("radar_plan", "none")
            .not_.is_("radar_active_until", "null")
            .lt("radar_active_until", now_iso)
            .execute()
        )
        expired_radar = expired_radar_res.data or []
        for s in expired_radar:
            try:
                sb.table("sellers").update({
                    "radar_plan": "none",
                    "radar_brands_limit": 0,
                    "radar_active_until": None,
                }).eq("id", s["id"]).execute()
                logger.info("radar plan expired", extra={
                    "seller_id": s["id"],
                    "email": s.get("email"),
                    "prev_radar_plan": s.get("radar_plan"),
                })
            except Exception:
                logger.exception("failed to expire radar plan for %s", s.get("id"))
        if expired_radar:
            logger.warning("expire-subscriptions: rolled back %d radar plans", len(expired_radar))

        if not expired and not expired_radar:
            logger.info("expire-subscriptions: nothing to expire")
    except Exception:
        logger.exception("expire-subscriptions job failed")


def _job_daily_reports() -> None:
    """Каждый день 09:00 UTC — диспетчер Excel-отчётов."""
    try:
        from app.jobs.reports import dispatch_daily_reports
        dispatch_daily_reports()
    except Exception:
        logger.exception("daily-reports scheduler job failed")


def _job_monthly_reports() -> None:
    """1-го числа каждого месяца в 09:30 UTC — управленческий PDF за прошлый месяц.

    Александр 01.06.2026 (Veloseller_Отчёт.txt): в отличие от еженедельных
    операционных Excel-отчётов, месячный отчёт идёт автоматически всем seller'ам
    с email+notify_email=true. Сравнивает текущий месяц с предыдущим.

    Запускается в 09:30 UTC, через 30 минут после daily-reports, чтобы не
    конкурировать с ним за ресурсы Resend и Storage.

    Идемпотентность через report_history с kind='monthly_report' — повторный
    запуск в тот же день не шлёт дубли.
    """
    try:
        from app.jobs.monthly_report import dispatch_monthly_reports
        dispatch_monthly_reports()
    except Exception:
        logger.exception("monthly-reports scheduler job failed")


def _job_refresh_landing_stats() -> None:
    """1-го числа в 03:30 UTC — платформенный агрегат витрины лендинга → system_settings."""
    try:
        from app.jobs.landing_stats import refresh_landing_stats
        result = refresh_landing_stats()
        logger.info("Cron landing-stats done: %s", result)
    except Exception:
        logger.exception("landing-stats scheduler job failed")


def _job_radar_poll() -> None:
    """Каждый день 06:00 UTC — опрос Wordstat для Radar."""
    try:
        from app.jobs.radar import poll_all_sellers
        result = poll_all_sellers()
        logger.info("Cron radar-poll done: %s", result)
    except Exception:
        logger.exception("radar-poll scheduler job failed")


def _job_radar_digest() -> None:
    """Понедельник + четверг 09:00 UTC — Telegram-дайджест по Radar."""
    try:
        from app.jobs.radar_digest import send_digests_to_all
        result = send_digests_to_all()
        logger.info("Cron radar-digest done: %s", result)
    except Exception:
        logger.exception("radar-digest scheduler job failed")


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


def _job_metrics_retention() -> None:
    """Инцидент 05.06.2026 (DB Size 82%): чистим осадок метрик.

    tvelo_metrics: скользящие period_start/period_end дают каждый день новый
    ключ upsert'а → ~17К новых строк ежедневно, старые никем не читаются
    (история динамики живёт в store_metrics/warehouse_metrics). Разовая чистка
    05.06 удалила 112К строк (110 МБ → 50 МБ); этот джоб не даёт осадку
    накопиться снова.

    changelog/inventory_events: recalc перезаписывает только последние 90 дней,
    строки старше 100 дней — мёртвый груз (плюс страховка от повторения
    инцидента с 503К строк missing_data — основной фикс в _write_changelog).
    """
    try:
        sb = get_supabase()
        cutoff_tvelo = (date.today() - timedelta(days=_TVELO_RETENTION_DAYS)).isoformat()
        execute_minimal(sb.table("tvelo_metrics").delete().lt("period_end", cutoff_tvelo))
        cutoff_events = (date.today() - timedelta(days=_EVENTS_RETENTION_DAYS)).isoformat()
        execute_minimal(sb.table("changelog").delete().lt("event_date", cutoff_events))
        execute_minimal(sb.table("inventory_events").delete().lt("event_date", cutoff_events))
        logger.info("metrics retention done: tvelo<%s, events/changelog<%s",
                    cutoff_tvelo, cutoff_events)
    except Exception:
        logger.exception("metrics retention job failed")


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
    # 05.06.2026: было CronTrigger(minute=5) — каждый час. Данные меняются раз
    # в сутки (sync 02:00), recalc после ручных синков вызывается из main —
    # 24 одинаковых пересчёта в день впустую жгли ~90% REST-вызовов (egress).
    _scheduler.add_job(
        _job_recalc_all,
        CronTrigger(hour=2, minute=40),
        id="recalc-all",
        replace_existing=True,
    )
    _scheduler.add_job(
        _job_sync_active_connections,
        CronTrigger(hour=2, minute=0),
        id="sync-active-connections",
        replace_existing=True,
    )
    # Авто-повтор временных ошибок (лимит WB / 5xx / сеть) каждые 5 минут.
    _scheduler.add_job(
        _job_retry_transient_errors,
        CronTrigger(minute="*/5"),
        id="retry-transient-errors",
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
    _scheduler.add_job(
        _job_metrics_retention,
        CronTrigger(hour=4, minute=30),
        id="metrics-retention",
        replace_existing=True,
    )
    _scheduler.add_job(
        _job_radar_poll,
        CronTrigger(hour=6, minute=0),
        id="radar-poll",
        replace_existing=True,
    )
    _scheduler.add_job(
        _job_daily_reports,
        CronTrigger(hour=9, minute=0),
        id="daily-reports",
        replace_existing=True,
    )
    # Месячный PDF-отчёт 1-го числа в 09:30 UTC (= 12:30 МСК).
    # Через 30 минут после daily-reports чтобы не конкурировать за Resend rate-limit.
    # day='1' в APScheduler означает 1-е число месяца.
    _scheduler.add_job(
        _job_monthly_reports,
        CronTrigger(day=1, hour=9, minute=30),
        id="monthly-reports",
        replace_existing=True,
    )
    # Витрина лендинга — 1-го числа в 03:30 UTC. После recalc-all (02:40), чтобы
    # store_metrics были свежими; раз в месяц, как обещает подпись на лендинге.
    _scheduler.add_job(
        _job_refresh_landing_stats,
        CronTrigger(day=1, hour=3, minute=30),
        id="landing-stats",
        replace_existing=True,
    )
    _scheduler.add_job(
        _job_radar_digest,
        CronTrigger(day_of_week="mon,thu", hour=9, minute=0),
        id="radar-digest",
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
