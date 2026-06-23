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

import html
import logging
import os

from apscheduler.events import EVENT_JOB_ERROR
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger

from app.db import execute_minimal, fetch_all, get_supabase
from app.jobs.recalc import recalc_all_sellers
from app.schemas import SourceType
from app.sources import google_sheet, ozon, shopify, wildberries
from app.telegram import send_message
from datetime import date, datetime, timedelta, timezone

logger = logging.getLogger("veloseller.scheduler")

_scheduler: BackgroundScheduler | None = None

_SNAPSHOTS_RETENTION_DAYS = 180
_STUCK_SYNCING_TIMEOUT_MINUTES = 30

# Retention метрик (инцидент 05.06.2026, DB Size 82% на Free-тарифе):
# - tvelo_metrics: ключ (product, period_start, period_end) со скользящими
#   датами — каждый день upsert создаёт НОВЫЕ строки. ВАЖНО: страница
#   /dashboard/dynamics строит графики ПО ИСТОРИИ tvelo_metrics (точка =
#   period_end), поэтому 7-дневный хвост ломал Динамику. На self-hosted (нет
#   лимита размера Free-тарифа) держим достаточный хвост под все агрегации
#   Динамики (день 30д, неделя 100д, месяц 210д) + буфер.
# - changelog / inventory_events: recalc перезаписывает только последние
#   90 дней; всё старше 100 дней — мёртвый осадок.
_TVELO_RETENTION_DAYS = 220
_EVENTS_RETENTION_DAYS = 100

# Лимит складов для trial-плана (при откате из истёкшей подписки).
# Должен совпадать с триггером update_warehouses_limit_on_plan_change (trial=3).
_TRIAL_WAREHOUSES_LIMIT = 3

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
    # Аудит 22.06: крон-пути звали синк БЕЗ sync-лока, который держат ручные
    # HTTP-обработчики (main._try_acquire_sync_lock). При совпадении ручного и
    # кронового синка одного склада возможны дубли снапшотов (в inventory_snapshots
    # нет уникального индекса). Берём тот же атомарный лок: флип status→'syncing'
    # с условием .neq('syncing'). Не взяли — склад уже синкается, пропускаем
    # (подхватим в следующий проход); зависший 'syncing' сбрасывает watchdog.
    lock = (sb.table("data_connections")
            .update({"status": "syncing", "last_error": None})
            .eq("id", conn["id"])
            .neq("status", "syncing")
            .execute())
    if not lock.data:
        logger.info("sync пропущен — склад уже синкается", extra={"connection_id": conn["id"]})
        return
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


_DAILY_REPORTS_HOUR_UTC = 9


def _job_catchup_missed_reports() -> None:
    """Догон пропущенных дневных отчётов после рестарта воркера.

    Крон daily-reports (09:00 UTC) НЕ навёрстывается APScheduler'ом, если воркер
    был в дауне в этот момент (deploy/restart) — пропущенный запуск не
    coalesce-ится в прошлое. Поэтому одноразово при старте: если уже позже
    09:00 UTC, повторно зовём dispatch_daily_reports(). Он идемпотентен
    (_already_sent_today по seller+channel+sent_date): если 09:00 уже отработал —
    no-op; если был пропущен — отчёты уйдут сейчас.

    До 09:00 UTC ничего не делаем — штатный крон отправит в 09:00.
    """
    try:
        now = datetime.now(timezone.utc)
        if now.hour < _DAILY_REPORTS_HOUR_UTC:
            logger.info("catchup-reports: до %d:00 UTC, пропуск", _DAILY_REPORTS_HOUR_UTC)
            return
        from app.jobs.reports import dispatch_daily_reports
        logger.info("catchup-reports: запуск dispatch (идемпотентный)")
        dispatch_daily_reports()
    except Exception:
        logger.exception("catchup-missed-reports job failed")


_SYNC_STALE_THRESHOLD_HOURS = 30
# Синк идёт РАЗ В СУТКИ (02:00 UTC), значит к вечеру last_sync_at штатно >12ч.
# Порог должен быть > 24ч, иначе ложный алерт каждый день. 30ч = пропущен
# суточный синк (как 5-7 июня) + буфер ~6ч.
# Антиспам: алерт о застрявшем синке шлём один раз на эпизод, при восстановлении — один раз.
# Флаг «уже отправлен» живёт в БД (system_settings), а НЕ в памяти процесса: иначе
# на нескольких воркер-репликах каждая держит своё состояние и шлёт дубли, плюс
# состояние терялось бы при рестарте воркера.
_SYNC_MONITOR_KEY = "sync_monitor_alerted"


def _monitoring_chat_ids(sb) -> list[str]:
    """Куда слать алерты мониторинга. Приоритет: env MONITORING_CHAT_ID, иначе
    telegram_chat_id админов (ADMIN_EMAILS). Пусто → джоба тихо пропускает."""
    explicit = (os.getenv("MONITORING_CHAT_ID") or "").strip()
    if explicit:
        return [explicit]
    admin_emails = [e.strip().lower() for e in (os.getenv("ADMIN_EMAILS") or "").split(",") if e.strip()]
    if not admin_emails:
        return []
    try:
        rows = fetch_all(sb.table("sellers").select("email,telegram_chat_id"))
    except Exception:
        return []
    return [
        str(r["telegram_chat_id"]) for r in rows
        if (r.get("email") or "").lower() in admin_emails and r.get("telegram_chat_id")
    ]


def _get_sync_monitor_alerted(sb) -> bool:
    """Читает общий (для всех реплик) флаг «алерт о застрявшем синке уже отправлен»."""
    try:
        res = (
            sb.table("system_settings")
            .select("value")
            .eq("key", _SYNC_MONITOR_KEY)
            .limit(1)
            .execute()
        )
        rows = getattr(res, "data", None) or []
        if not rows:
            return False
        return bool((rows[0].get("value") or {}).get("alerted", False))
    except Exception:
        # Fail-closed: не уверены в состоянии → считаем, что уже алертили (не спамим).
        logger.warning("monitor: чтение флага алерта упало, считаю alerted=True")
        return True


def _set_sync_monitor_alerted(sb, value: bool) -> None:
    """Пишет общий флаг алерта в system_settings (upsert по key)."""
    try:
        sb.table("system_settings").upsert(
            {
                "key": _SYNC_MONITOR_KEY,
                "value": {"alerted": value},
                "category": "monitoring",
                "description": "Антиспам-флаг алерта о застрявшем синке (общий для всех реплик воркера)",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="key",
        ).execute()
    except Exception:
        logger.warning("monitor: запись флага алерта (%s) упала", value)


def _job_monitor_sync_freshness() -> None:
    """Раз в 30 мин проверяет свежесть синка. Если у активного склада последний
    успешный синк был >30ч назад (last_sync_at) — шлёт алерт в Telegram (один раз
    на эпизод). При восстановлении — уведомление. Склады моложе порога и paused
    не учитываются. Адресат: env MONITORING_CHAT_ID или telegram админов.
    """
    try:
        sb = get_supabase()
        now = datetime.now(timezone.utc)
        stale_threshold = now - timedelta(hours=_SYNC_STALE_THRESHOLD_HOURS)
        conns = fetch_all(
            sb.table("data_connections")
            .select("id,name,last_sync_at,status,created_at")
            .neq("status", "paused")
        )
        stale = []
        for c in conns:
            created = c.get("created_at")
            if created:
                try:
                    if datetime.fromisoformat(str(created).replace("Z", "+00:00")) > stale_threshold:
                        continue  # склад моложе порога — мог ещё не синкнуться
                except Exception:
                    pass
            ls = c.get("last_sync_at")
            if ls is None:
                stale.append((c.get("name") or c.get("id"), "ни разу"))
                continue
            try:
                ls_dt = datetime.fromisoformat(str(ls).replace("Z", "+00:00"))
            except Exception:
                continue
            if ls_dt < stale_threshold:
                hrs = int((now - ls_dt).total_seconds() // 3600)
                stale.append((c.get("name") or c.get("id"), f"{hrs}ч назад"))

        chat_ids = _monitoring_chat_ids(sb)
        alerted = _get_sync_monitor_alerted(sb)

        if stale:
            if not alerted:
                lines = [
                    "⚠️ <b>Veloseller: синк не отрабатывает</b>",
                    f"Складов без свежего синка (&gt;{_SYNC_STALE_THRESHOLD_HOURS}ч): <b>{len(stale)}</b>",
                    "",
                ]
                lines += [f"• {html.escape(str(n))} — {w}" for n, w in stale[:15]]
                text = "\n".join(lines)
                for cid in chat_ids:
                    send_message(cid, text)
                if not chat_ids:
                    logger.warning(
                        "sync stale (%d складов), но MONITORING_CHAT_ID/админ-телеграм не настроены",
                        len(stale),
                    )
                _set_sync_monitor_alerted(sb, True)
                logger.warning("sync freshness alert", extra={"stale_count": len(stale)})
        else:
            if alerted:
                for cid in chat_ids:
                    send_message(cid, "✅ <b>Veloseller: синк восстановился</b>\nВсе активные склады синхронизируются штатно.")
                logger.info("sync freshness recovered")
                _set_sync_monitor_alerted(sb, False)
    except Exception:
        logger.exception("monitor sync freshness job failed")


def _persist_via_main(seller_id, connection_id, source_str, snapshots):
    """Импорт из main отложенный во избежание циклов."""
    from app.main import _persist_snapshots
    _persist_snapshots(seller_id, connection_id, SourceType(source_str), snapshots)


def _on_job_error(event) -> None:
    """Сетка безопасности: тела джобов и так в try/except, но если исключение
    всё же вылетит наружу — логируем (а не теряем молча). exc_info → Sentry."""
    logger.error("scheduled job raised", extra={"job_id": event.job_id},
                 exc_info=event.exception)


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    # job_defaults:
    #  - misfire_grace_time=3600: рестарт воркера в момент срабатывания (деплой
    #    в 02:00/02:40) больше НЕ роняет дневной sync/recalc молча (дефолт был 1с);
    #  - coalesce=True: серия пропущенных запусков схлопывается в один (важно для
    #    частых */5,*/10 джобов после долгого даунтайма — не выстреливают пачкой);
    #  - max_instances=1: один и тот же джоб не идёт в два потока внахлёст.
    _scheduler = BackgroundScheduler(
        timezone="UTC",
        job_defaults={"coalesce": True, "max_instances": 1, "misfire_grace_time": 3600},
    )
    _scheduler.add_listener(_on_job_error, EVENT_JOB_ERROR)
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
    # Догон пропущенных отчётов: одноразовый запуск через 45с после старта.
    # Покрывает случай, когда воркер был в дауне в 09:00 UTC (deploy) и крон
    # daily-reports пропустил запуск. dispatch идемпотентен — двойной отправки нет.
    _scheduler.add_job(
        _job_catchup_missed_reports,
        DateTrigger(run_date=datetime.now(timezone.utc) + timedelta(seconds=45)),
        id="catchup-missed-reports",
        replace_existing=True,
    )
    # Мониторинг свежести синка — каждые 30 минут. Алерт в Telegram, если
    # активный склад не синкался >30ч (адресат: MONITORING_CHAT_ID / ADMIN_EMAILS).
    _scheduler.add_job(
        _job_monitor_sync_freshness,
        CronTrigger(minute="*/30"),
        id="monitor-sync-freshness",
        replace_existing=True,
    )
    _scheduler.start()


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
