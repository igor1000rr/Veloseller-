"""Radar digest — формирование и отправка дайджеста по новинкам.

Концепция дайджеста (из ТЗ Александра):
  "С 10 брендов 5 фраз в 2 недели, которые можно себе выписать"

Что в дайджесте:
  - Новые запросы (status=new) — новинки, которых ещё нет в прайсе селлера
  - Резко выросшие фразы (trend_pct > 50%) — инфоповоды
  - Общее количество отслеживаемых брендов

Расписание:
  - Дважды в неделю: понедельник и четверг в 09:00 UTC (12:00 МСК)
  - Дайджест отправляется только если есть хотя бы 1 новый сигнал за период
  - Если юзер выключил notify_telegram/notify_email в настройках — пропускаем
Анти-спам:
  - Не больше 1 дайджеста в день на селлера
  - Сохраняем факт отправки в radar_actions для дедупа

ВАЖНО (Radar v2): поллер пишет только статусы new/archived/watching (статус
'early' убран) и НЕ заполняет present_in_wb/present_in_ozon (suggest убран,
поля остаются nullable). Дайджест опирается на это: «резкий рост» = trend_pct
по не-archived запросам, маркетплейсы в строке не показываем.
"""
from __future__ import annotations

import html
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from app.db import fetch_all, get_supabase
from app.telegram import send_message, clear_dead_telegram

logger = logging.getLogger("veloseller.radar.digest")

_DIGEST_LOOKBACK_DAYS = 7
_DIGEST_MAX_ITEMS = 10
_TRENDING_FREQUENCY_THRESHOLD = 50  # мин частота чтобы попасть в дайджест
_TRENDING_PCT_THRESHOLD = 50.0  # min trend_pct для "резкого роста"


def _app_url() -> str:
    raw = os.getenv("APP_URL") or "https://veloseller.ru"
    return raw.split(",")[0].strip().rstrip("/")


def _format_digest_html(seller_name: str, brands_count: int, new_items: list[dict], trending_items: list[dict]) -> str:
    """Формирует HTML-сообщение для Telegram."""
    app_url = _app_url()
    lines = [
        f"<b>🔍 Radar дайджест</b>",
        f"Отслеживается брендов: <b>{brands_count}</b>",
        "",
    ]

    if new_items:
        lines.append(f"<b>🔥 Новые запросы ({len(new_items)})</b> — пора закупать")
        for item in new_items[:_DIGEST_MAX_ITEMS]:
            phrase = html.escape(item.get("query_text", "—"))
            brand = html.escape(item.get("brand_name", "—"))
            freq = item.get("current_frequency", 0) or 0
            # present_in_wb/ozon в v2 всегда NULL (suggest убран) — не показываем.
            lines.append(
                f"  · <code>{phrase}</code> ({brand}) — {freq:,} / мес".replace(",", " ")
            )
        lines.append("")

    if trending_items:
        lines.append(f"<b>📈 Резкий рост ({len(trending_items)})</b> — инфоповод")
        for item in trending_items[:_DIGEST_MAX_ITEMS]:
            phrase = html.escape(item.get("query_text", "—"))
            brand = html.escape(item.get("brand_name", "—"))
            freq = item.get("current_frequency", 0) or 0
            trend = item.get("trend_pct", 0) or 0
            lines.append(
                f"  · <code>{phrase}</code> ({brand}) — {freq:,} · +{trend:.0f}%".replace(",", " ")
            )
        lines.append("")

    lines.append(f'<a href="{app_url}/dashboard/radar">Открыть Radar</a>')
    return "\n".join(lines)


def build_seller_digest(sb, seller: dict) -> Optional[str]:
    """Формирует дайджест для одного селлера. Returns None если нечего отправлять."""
    seller_id = seller["id"]

    # Считаем бренды
    brands_res = (
        sb.table("radar_brands")
        .select("id", count="exact", head=True)
        .eq("seller_id", seller_id)
        .eq("status", "approved")
        .execute()
    )
    brands_count = getattr(brands_res, "count", 0) or 0
    if brands_count == 0:
        return None  # нечего отслеживать

    cutoff = (datetime.now(timezone.utc) - timedelta(days=_DIGEST_LOOKBACK_DAYS)).isoformat()

    # Новые новинки за последнюю неделю (status=new, частота выше порога)
    new_items = fetch_all(
        sb.table("radar_queries_view")
        .select("*")
        .eq("seller_id", seller_id)
        .eq("status", "new")
        .gte("current_frequency", _TRENDING_FREQUENCY_THRESHOLD)
        .gte("last_updated_at", cutoff)
        .order("current_frequency", desc=True)
        .limit(_DIGEST_MAX_ITEMS)
    )

    # Резко выросшие фразы (инфоповод). В v2 статуса 'early' нет, поэтому берём
    # любые НЕ archived запросы с заметным ростом trend_pct. trend_pct = NULL
    # (первое появление) отсекается условием gte автоматически.
    trending_raw = fetch_all(
        sb.table("radar_queries_view")
        .select("*")
        .eq("seller_id", seller_id)
        .neq("status", "archived")
        .gte("current_frequency", _TRENDING_FREQUENCY_THRESHOLD)
        .gte("trend_pct", _TRENDING_PCT_THRESHOLD)
        .gte("last_updated_at", cutoff)
        .order("trend_pct", desc=True)
        .limit(_DIGEST_MAX_ITEMS)
    )
    # Дедуп: не дублируем то, что уже показано в блоке «новые».
    new_ids = {it.get("id") for it in new_items}
    trending_items = [it for it in trending_raw if it.get("id") not in new_ids]

    if not new_items and not trending_items:
        return None  # нечего отправлять — не спамим пустыми дайджестами

    return _format_digest_html(
        seller.get("display_name") or seller.get("email") or "селлер",
        brands_count,
        new_items,
        trending_items,
    )


def _already_sent_today(sb, seller_id: str) -> bool:
    """Проверяет был ли дайджест уже отправлен сегодня (анти-дубль при рестарте worker'а)."""
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    try:
        res = (
            sb.table("radar_actions")
            .select("id", count="exact", head=True)
            .eq("seller_id", seller_id)
            .eq("action_type", "digest_sent")
            .gte("created_at", today_start)
            .execute()
        )
        return (getattr(res, "count", 0) or 0) > 0
    except Exception as e:
        # Fail-closed: при ошибке БД считаем, что уже отправляли — лучше пропустить
        # один дайджест, чем заспамить дублями (особенно на нескольких репликах).
        logger.warning("radar_digest: дедуп-проверка упала для %s, пропускаю отправку: %s", seller_id, e)
        return True


def send_digests_to_all() -> dict[str, Any]:
    """Главная точка входа scheduler'а. Отправляет дайджесты всем подписчикам Radar."""
    sb = get_supabase()

    sellers = fetch_all(
        sb.table("sellers")
        .select("id, email, display_name, telegram_chat_id, notify_telegram, radar_plan, radar_active_until")
        .neq("radar_plan", "none")
    )

    sent_count = 0
    skipped_no_brands = 0
    skipped_no_signals = 0
    skipped_no_channel = 0
    skipped_already_sent = 0
    errors = 0

    for seller in sellers:
        seller_id = seller["id"]

        # Активен ли Radar?
        active_until = seller.get("radar_active_until")
        if active_until:
            try:
                if datetime.fromisoformat(active_until.replace("Z", "+00:00")) < datetime.now(timezone.utc):
                    continue  # истёк
            except Exception as e:
                # Fail-closed: не распарсили дату окончания — не шлём (вдруг подписка истекла).
                logger.warning("radar_digest: битая radar_active_until у %s (%r), пропускаю: %s", seller_id, active_until, e)
                continue

        # Есть ли канал отправки?
        chat_id = seller.get("telegram_chat_id")
        if not chat_id or not seller.get("notify_telegram"):
            skipped_no_channel += 1
            continue

        # Дедуп по дню (если scheduler отработал 2 раза)
        if _already_sent_today(sb, seller_id):
            skipped_already_sent += 1
            continue

        try:
            message = build_seller_digest(sb, seller)
            if message is None:
                # Определяем причину: нет брендов или нет сигналов
                brands_res = sb.table("radar_brands").select("id", count="exact", head=True).eq(
                    "seller_id", seller_id).eq("status", "approved").execute()
                if (getattr(brands_res, "count", 0) or 0) == 0:
                    skipped_no_brands += 1
                else:
                    skipped_no_signals += 1
                continue

            ok = send_message(chat_id, message, on_dead_chat=lambda: clear_dead_telegram(sb, seller_id))
            if ok:
                sent_count += 1
                # Логируем факт отправки для анти-дубля
                try:
                    sb.table("radar_actions").insert({
                        "seller_id": seller_id,
                        "action_type": "digest_sent",
                    }).execute()
                except Exception:
                    logger.warning("radar.digest: не удалось записать radar_actions для %s", seller_id)
            else:
                errors += 1
        except Exception:
            logger.exception("radar.digest: ошибка для селлера %s", seller_id)
            errors += 1

    summary = {
        "sellers_total": len(sellers),
        "sent": sent_count,
        "skipped_no_brands": skipped_no_brands,
        "skipped_no_signals": skipped_no_signals,
        "skipped_no_channel": skipped_no_channel,
        "skipped_already_sent": skipped_already_sent,
        "errors": errors,
    }
    logger.info("radar.digest done: %s", summary)
    return summary
