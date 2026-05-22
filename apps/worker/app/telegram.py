"""Telegram bot notifications. Без gRPC/long-polling — только Bot API send_message.
Этап 3: ссылки в дайджесте ведут на /dashboard/reports (URL rename).
"""
from __future__ import annotations
import html
import logging
import os
import httpx

logger = logging.getLogger("veloseller.telegram")

API_BASE = "https://api.telegram.org/bot"


def _app_url() -> str:
    raw = os.getenv("APP_URL") or "https://veloseller.ru"
    return raw.split(",")[0].strip().rstrip("/")


def send_message(chat_id: str, text: str, *, parse_mode: str = "HTML") -> bool:
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


def send_document(
    chat_id: str,
    file_bytes: bytes,
    filename: str,
    caption: str = "",
    parse_mode: str = "HTML",
) -> bool:
    """Шлёт файл в telegram через Bot API sendDocument."""
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token or not chat_id:
        return False
    try:
        files = {
            "document": (filename, file_bytes, "application/octet-stream"),
        }
        data = {"chat_id": chat_id}
        if caption:
            data["caption"] = caption
            data["parse_mode"] = parse_mode
        r = httpx.post(
            f"{API_BASE}{token}/sendDocument",
            data=data,
            files=files,
            timeout=60.0,
        )
        if r.status_code != 200:
            logger.warning("Telegram sendDocument %s: %s", r.status_code, r.text[:200])
            return False
        return True
    except Exception as e:
        logger.exception("Telegram sendDocument error: %s", e)
        return False


def format_alerts_digest(alerts: list[dict]) -> str:
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
    lines.append(f'\n<a href="{app_url}/dashboard/reports">Открыть в Veloseller</a>')
    return "\n".join(lines)


def format_sync_error_message(
    warehouse_name: str,
    warehouse_kind: str,
    error_message: str,
    failure_count: int,
    auto_paused: bool,
) -> str:
    name_safe = html.escape(warehouse_name)
    error_safe = html.escape(error_message[:300])
    kind_label = {
        "ozon_fbo": "Ozon FBO", "ozon_fbs": "Ozon FBS",
        "wb_fbo": "Wildberries FBO", "wb_fbs": "Wildberries FBS",
        "google_sheet": "Google Sheet",
    }.get(warehouse_kind, warehouse_kind)
    app_url = _app_url()

    if auto_paused:
        title = f"⛔️ <b>Склад «{name_safe}» поставлен на паузу</b>"
        intro = f"Неудач подряд: <b>{failure_count}</b>. Автосинхронизация отключена."
    else:
        title = f"⚠️ <b>Ошибка синхронизации склада «{name_safe}»</b>"
        intro = f"Тип: {kind_label}\nНеудач подряд: <b>{failure_count}</b>"

    return (
        f"{title}\n\n{intro}\n\n"
        f"<code>{error_safe}</code>\n\n"
        f'<a href="{app_url}/connections">Открыть склад</a>'
    )
