"""Telegram bot notifications. Без gRPC/long-polling — только Bot API send_message.

БАГ 21 fix: SKU и message экранируются через html.escape перед вставкой в HTML.
БАГ 51 fix: домен из env APP_URL (продакшен veloseller.ru, не .app).
"""
from __future__ import annotations
import html
import logging
import os
import httpx

logger = logging.getLogger("veloseller.telegram")

API_BASE = "https://api.telegram.org/bot"


def _app_url() -> str:
    """Первый URL из APP_URL env (whitelist). Дефолт — veloseller.ru."""
    raw = os.getenv("APP_URL") or "https://veloseller.ru"
    return raw.split(",")[0].strip().rstrip("/")


def send_message(chat_id: str, text: str, *, parse_mode: str = "HTML") -> bool:
    """Шлёт сообщение в telegram. Возвращает True если успешно."""
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token or not chat_id:
        return False
    try:
        r = httpx.post(
            f"{API_BASE}{token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": parse_mode, "disable_web_page_preview": True},
            timeout=15.0,
        )
        if r.status_code != 200:
            logger.warning("Telegram API %s: %s", r.status_code, r.text[:200])
            return False
        return True
    except Exception as e:
        logger.exception("Telegram send error: %s", e)
        return False


def format_alerts_digest(alerts: list[dict]) -> str:
    """HTML-форматированный digest для Telegram.

    БАГ 21: sku и message экранируются.
    БАГ 51: ссылка ведёт на актуальный домен из APP_URL.
    """
    if not alerts:
        return ""
    kind_emoji = {
        "critical_stock": "🔴",
        "low_stock": "🟡",
        "dead_inventory": "⚫️",
        "repeated_stockout": "🟠",
        "underestimated_sku": "🟣",
    }
    lines = [f"<b>Veloseller — {len(alerts)} новых уведомлений</b>", ""]
    for a in alerts[:20]:
        emoji = kind_emoji.get(a.get("kind", ""), "•")
        product = a.get("products") or {}
        if isinstance(product, list):
            product = product[0] if product else {}
        sku = product.get("sku", "—")
        sku_safe = html.escape(str(sku))
        message_safe = html.escape(str(a.get("message", "")))
        lines.append(f"{emoji} <code>{sku_safe}</code> — {message_safe}")
    if len(alerts) > 20:
        lines.append(f"\n…ещё {len(alerts) - 20}")
    app_url = _app_url()
    lines.append(f'\n<a href="{app_url}/dashboard/alerts">Открыть в Veloseller</a>')
    return "\n".join(lines)
