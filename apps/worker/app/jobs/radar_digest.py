"""Radar digest — формирование и отправка дайджеста по новинкам.

Концепция дайджеста (из ТЗ Александра):
  "С 10 брендов 5 фраз в 2 недели, которые можно себе выписать"

Что в дайджесте:
  - Новые запросы (status=new) — появились в suggest за последние 7 дней
  - Ранние сигналы с большим ростом (trend_pct > 50%) — инфоповоды
  - Общее количество отслеживаемых брендов

Расписание:
  - Дважды в неделю: понедельник и четверг в 09:00 UTC (12:00 МСК)
  - Дайджест отправляется только если есть хотя бы 1 новый сигнал за период
  - Если юзер выключил notify_telegram/notify_email в настройках — пропускаем
Анти-спам:
  - Не больше 1 дайджеста в день на селлера
  - Сохраняем факт отправки в radar_actions для дедупа
"""
from __future__ import annotations

import html
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from app.db import fetch_all, get_supabase
from app.telegram import send_message

logger = logging.getLogger("veloseller.radar.digest")

_DIGEST_LOOKBACK_DAYS = 7
_DIGEST_MAX_ITEMS = 10
_TRENDING_FREQUENCY_THRESHOLD = 50  # мин частота чтобы попасть в дайджест
_TRENDING_PCT_THRESHOLD = 50.0  # min trend_pct для "раннего сигнала"


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
        lines.append(f"<b>🔥 Новые в suggest ({len(new_items)})</b> — пора закупать")
        for item in new_items[:_DIGEST_MAX_ITEMS]:
            phrase = html.escape(item.get("query_text", "—"))
            brand = html.escape(item.get("brand_name", "—"))
            freq = item.get("current_frequency", 0) or 0
            wb = "WB" if item.get("present_in_wb") else "—"
            ozon = "OZON" if item.get("present_in_ozon") else "—"
            marketplaces = "/".join(filter(lambda x: x != "—", [wb, ozon])) or "—"
            lines.append(
                f"  · <code>{phrase}</code> ({brand}) — {freq:,} / мес · {marketplaces}".replace(",", " ")
            )
        lines.append("")

    if trending_items:
        lines.append(f"<b>📈 Ранние сигналы ({len(trending_items)})</b> — инфоповод")
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

    # Новые в suggest за последнюю неделю (status=new + first_seen или first_suggest_seen за 7 дней)
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

    # Ранние сигналы с большим ростом — только те что выросли резко (инфоповод)
    trending_items = fetch_all(
        sb.table("radar_queries_view")
        .select("*")
        .eq("seller_id", seller_id)
        .eq("status", "early")
        .gte("current_frequency", _TRENDING_FREQUENCY_THRESHOLD)
        .gte("trend_pct", _TRENDING_PCT_THRESHOLD)
        .gte("last_updated_at", cutoff)
        .order("trend_pct", desc=True)
        .limit(_DIGEST_MAX_ITEMS)
    )

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
    except Exception:
        return False


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
            except Exception:
                pass

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

            ok = send_message(chat_id, message)
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
