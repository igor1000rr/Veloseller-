"""Отправка email-уведомлений через Resend.

Если RESEND_API_KEY не задан — функции no-op (логируют и возвращают False).

БАГ 20 fix: все user-provided строки (sku, message, seller_name) экранируются
через html.escape перед вставкой в HTML.

БАГ 51 fix: домен из env APP_URL вместо hardcoded veloseller.app (продакшен
на veloseller.ru, ссылки вели на несуществующий домен).

Multi-warehouse (май 2026): send_sync_error_notification для уведомлений о неудачах sync.
"""
from __future__ import annotations

import html
import logging
import os
from typing import Optional

logger = logging.getLogger("veloseller.notifications")


def _app_url() -> str:
    """Возвращает первый URL из APP_URL env (comma-separated whitelist).

    Дефолт — продакшен veloseller.ru.
    """
    raw = os.getenv("APP_URL") or "https://veloseller.ru"
    return raw.split(",")[0].strip().rstrip("/")


def send_alert_digest(to_email: str, seller_name: Optional[str], alerts: list[dict]) -> bool:
    """Шлёт daily digest по непрочитанным критичным alerts."""
    api_key = os.getenv("RESEND_API_KEY")
    from_email = os.getenv("RESEND_FROM", "Veloseller <noreply@veloseller.ru>")
    if not api_key:
        logger.info(f"RESEND_API_KEY не задан — пропускаю digest для {to_email}")
        return False
    if not alerts:
        return False

    try:
        import resend
        resend.api_key = api_key
    except ImportError:
        logger.warning("resend SDK не установлен")
        return False

    rows = []
    for a in alerts:
        kind_label = {
            "critical_stock": "🔴 Критически мало",
            "low_stock": "🟡 Мало",
            "dead_inventory": "⚫ Неликвид",
            "repeated_stockout": "🟠 Регулярный OOS",
            "underestimated_sku": "🟣 Недооценён",
        }.get(a.get("kind", ""), html.escape(a.get("kind", "")))
        sku = (a.get("products") or {}).get("sku", "—") if isinstance(a.get("products"), dict) else "—"
        sku_safe = html.escape(str(sku))
        message_safe = html.escape(str(a.get("message", "")))
        rows.append(f"<tr><td style='padding:6px 12px;border-bottom:1px solid #e2e8f0'>{kind_label}</td>"
                    f"<td style='padding:6px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace'>{sku_safe}</td>"
                    f"<td style='padding:6px 12px;border-bottom:1px solid #e2e8f0'>{message_safe}</td></tr>")

    safe_name = html.escape(seller_name) if seller_name else ""
    greeting = f"Привет{', ' + safe_name if safe_name else ''}!"
    app_url = _app_url()
    html_body = f"""<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;color:#0f172a;max-width:680px;margin:0 auto;padding:24px">
<h2 style="color:#0f766e;margin:0 0 16px">Veloseller — дневной digest</h2>
<p>{greeting}</p>
<p>За последние 24 часа появились {len(alerts)} новых уведомлений:</p>
<table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:14px">
<thead><tr style="background:#f8fafc"><th style="text-align:left;padding:8px 12px">Тип</th><th style="text-align:left;padding:8px 12px">SKU</th><th style="text-align:left;padding:8px 12px">Сообщение</th></tr></thead>
<tbody>{''.join(rows)}</tbody></table>
<p style="margin-top:24px"><a href="{app_url}/dashboard/alerts" style="display:inline-block;background:#0f766e;color:white;padding:10px 20px;border-radius:8px;text-decoration:none">Открыть в Veloseller</a></p>
<p style="color:#64748b;font-size:12px;margin-top:32px">Если не хотите получать эти письма — отпишитесь в настройках профиля.</p>
</body></html>"""

    try:
        resend.Emails.send({
            "from": from_email,
            "to": [to_email],
            "subject": f"Veloseller: {len(alerts)} новых уведомлений",
            "html": html_body,
        })
        return True
    except Exception as e:
        logger.exception(f"Resend error для {to_email}: {e}")
        return False


def send_sync_error_notification(
    to_email: str,
    warehouse_name: str,
    warehouse_kind: str,
    error_message: str,
    failure_count: int,
    auto_paused: bool,
) -> bool:
    """Шлёт email о неудаче sync склада.

    Args:
        to_email: email получателя
        warehouse_name: юзерское название склада
        warehouse_kind: ozon_fbo/ozon_fbs/wb_fbo/wb_fbs/google_sheet
        error_message: текст ошибки от источника
        failure_count: подряд неудач (для сообщения в письме)
        auto_paused: True если склад был поставлен на паузу из-за 3+ неудач
    """
    api_key = os.getenv("RESEND_API_KEY")
    from_email = os.getenv("RESEND_FROM", "Veloseller <noreply@veloseller.ru>")
    if not api_key:
        logger.info("RESEND_API_KEY не задан — пропускаю sync error notification для %s", to_email)
        return False

    try:
        import resend
        resend.api_key = api_key
    except ImportError:
        logger.warning("resend SDK не установлен")
        return False

    name_safe = html.escape(warehouse_name)
    error_safe = html.escape(error_message[:500])
    kind_label = {
        "ozon_fbo": "Ozon FBO", "ozon_fbs": "Ozon FBS",
        "wb_fbo": "Wildberries FBO", "wb_fbs": "Wildberries FBS",
        "google_sheet": "Google Sheet",
    }.get(warehouse_kind, warehouse_kind)
    app_url = _app_url()

    if auto_paused:
        subject = f"⚠ Veloseller: склад «{warehouse_name}» поставлен на паузу"
        headline = f"Склад «{name_safe}» поставлен на паузу"
        body_intro = (
            f"Синхронизация склада не удалась <b>{failure_count} раз подряд</b>. "
            "Мы временно отключили автосинхронизацию, чтобы не бить API источника впустую. "
            "Проверьте ключи и включите sync вручную из личного кабинета."
        )
        accent_color = "#dc2626"
    else:
        subject = f"⚠ Veloseller: ошибка синхронизации склада «{warehouse_name}»"
        headline = f"Ошибка синхронизации склада «{name_safe}»"
        body_intro = (
            f"При очередной синхронизации склада «{kind_label}» произошла ошибка. "
            "Мы продолжаем пытаться, но если ошибка повторится ещё несколько раз — "
            "автосинхронизация будет приостановлена."
        )
        accent_color = "#ea580c"

    html_body = f"""<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;color:#0f172a;max-width:680px;margin:0 auto;padding:24px">
<h2 style="color:{accent_color};margin:0 0 16px">{headline}</h2>
<p>{body_intro}</p>
<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin-top:16px;font-family:monospace;font-size:13px;color:#991b1b;white-space:pre-wrap;word-break:break-word">{error_safe}</div>
<p style="margin-top:24px;color:#64748b;font-size:13px">Тип источника: <b>{kind_label}</b><br>Неудач подряд: <b>{failure_count}</b></p>
<p style="margin-top:24px"><a href="{app_url}/connections" style="display:inline-block;background:#0f766e;color:white;padding:10px 20px;border-radius:8px;text-decoration:none">Открыть склад</a></p>
<p style="color:#64748b;font-size:12px;margin-top:32px">Письмо от Veloseller в связи с ошибкой sync. Мы не будем присылать повторные уведомления о той же ошибке в ближайшие 24 часа.</p>
</body></html>"""

    try:
        resend.Emails.send({
            "from": from_email,
            "to": [to_email],
            "subject": subject,
            "html": html_body,
        })
        logger.info("sync error notification sent", extra={
            "to": to_email, "warehouse_kind": warehouse_kind,
            "failure_count": failure_count, "auto_paused": auto_paused,
        })
        return True
    except Exception as e:
        logger.exception(f"Resend sync-error notification failed for {to_email}: {e}")
        return False
