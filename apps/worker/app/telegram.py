"""Telegram bot notifications. Без gRPC/long-polling — только Bot API send_message.
Ссылки в дайджесте ведут на /dashboard/alerts (текущий URL).
"""
from __future__ import annotations
import html
import logging
import os
import time
import httpx

logger = logging.getLogger("veloseller.telegram")

API_BASE = "https://api.telegram.org/bot"
_MAX_429_RETRIES = 3


def _app_url() -> str:
    raw = os.getenv("APP_URL") or "https://veloseller.ru"
    return raw.split(",")[0].strip().rstrip("/")


def _retry_after_seconds(r: httpx.Response) -> float:
    """Сколько ждать при 429 — из тела (parameters.retry_after) или Retry-After."""
    try:
        ra = (r.json().get("parameters") or {}).get("retry_after")
        if ra:
            return min(float(ra), 30.0)
    except Exception:
        pass
    hdr = r.headers.get("retry-after")
    if hdr:
        try:
            return min(float(hdr), 30.0)
        except ValueError:
            pass
    return 1.0


def _post_telegram(method: str, **kwargs) -> httpx.Response | None:
    """POST к Bot API с обработкой rate-limit: на 429 ждём Retry-After и
    повторяем (до _MAX_429_RETRIES). Раньше 429 не обрабатывался — при рассылках
    на много чатов сообщения молча терялись. Возвращает Response (любого статуса)
    или None при сетевой ошибке/отсутствии токена."""
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        return None
    url = f"{API_BASE}{token}/{method}"
    r: httpx.Response | None = None
    for attempt in range(_MAX_429_RETRIES + 1):
        try:
            r = httpx.post(url, **kwargs)
        except Exception as e:
            logger.exception("Telegram %s network error: %s", method, e)
            return None
        if r.status_code == 429 and attempt < _MAX_429_RETRIES:
            wait = _retry_after_seconds(r)
            logger.warning("Telegram 429 на %s — повтор через %.1fс (попытка %d)", method, wait, attempt + 1)
            time.sleep(wait)
            continue
        return r
    return r


def send_message(chat_id: str, text: str, *, parse_mode: str = "HTML") -> bool:
    if not os.getenv("TELEGRAM_BOT_TOKEN") or not chat_id:
        return False
    r = _post_telegram(
        "sendMessage",
        json={"chat_id": chat_id, "text": text, "parse_mode": parse_mode, "disable_web_page_preview": True},
        timeout=15.0,
    )
    if r is None:
        return False
    if r.status_code != 200:
        logger.warning("Telegram API %s: %s", r.status_code, r.text[:200])
        return False
    return True


def send_document(
    chat_id: str,
    file_bytes: bytes,
    filename: str,
    caption: str = "",
    parse_mode: str = "HTML",
) -> bool:
    """Шлёт файл в telegram через Bot API sendDocument."""
    if not os.getenv("TELEGRAM_BOT_TOKEN") or not chat_id:
        return False
    files = {
        "document": (filename, file_bytes, "application/octet-stream"),
    }
    data = {"chat_id": chat_id}
    if caption:
        data["caption"] = caption
        data["parse_mode"] = parse_mode
    r = _post_telegram("sendDocument", data=data, files=files, timeout=60.0)
    if r is None:
        return False
    if r.status_code != 200:
        logger.warning("Telegram sendDocument %s: %s", r.status_code, r.text[:200])
        return False
    return True


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
    lines.append(f'\n<a href="{app_url}/dashboard/alerts">Открыть в Veloseller</a>')
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
