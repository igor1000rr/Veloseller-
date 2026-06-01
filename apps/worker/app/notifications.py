"""Отправка email-уведомлений через Resend.

Если RESEND_API_KEY не задан — функции no-op (логируют и возвращают False).
Ссылки в email ведут на /dashboard/alerts (текущий URL).
"""
from __future__ import annotations

import base64
import html
import logging
import os
from typing import Optional

logger = logging.getLogger("veloseller.notifications")


# Александр 01.06.2026 переименовал листы отчёта. Лейблы синхронизированы
# с reports.py::KIND_LABELS — чтобы в email-уведомлении и в самом Excel
# было одинаково.
_KIND_LABELS = {
    "low_stock":          "Низкий остаток",
    "critical_stock":     "Критический остаток",
    "dead_inventory":     "Замороженные остатки",   # бывш. "Неликвид"
    "repeated_stockout":  "Частый out-of-stock",
    "underestimated_sku": "Потерянные продажи",     # бывш. "Недооценённый SKU"
    "sync_error":         "Ошибки синхронизации",
    "weekly_report":      "Сводка по складу",
}


def _app_url() -> str:
    raw = os.getenv("APP_URL") or "https://veloseller.ru"
    return raw.split(",")[0].strip().rstrip("/")


def _extract_resend_msg_id(response) -> Optional[str]:
    """Извлекает message id из ответа resend.Emails.send."""
    if response is None:
        return None
    if isinstance(response, dict):
        return response.get("id") or response.get("message_id")
    if hasattr(response, "id"):
        return getattr(response, "id", None)
    if hasattr(response, "get"):
        try:
            return response.get("id")
        except Exception:
            return None
    return None


def send_alert_digest(to_email: str, seller_name: Optional[str], alerts: list[dict]) -> bool:
    """Старый digest по real-time alerts. Сохранён для бэкворд-совместимости."""
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
            "dead_inventory": "⚫ Замороженные остатки",
            "repeated_stockout": "🟠 Регулярный OOS",
            "underestimated_sku": "🟣 Потерянные продажи",
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

    Александр 01.06.2026: вместо листа в Excel отчёте sync_error теперь
    направляется отдельным письмом в момент ошибки. Эта функция уже
    вызывается из sync.py — никаких изменений тут не нужно.
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


def send_weekly_report_email(
    to_email: str,
    seller_name: Optional[str],
    xlsx_bytes: bytes,
    filename: str,
) -> bool:
    """Старая функция weekly_report. Backward-compat."""
    api_key = os.getenv("RESEND_API_KEY")
    from_email = os.getenv("RESEND_FROM", "Veloseller <noreply@veloseller.ru>")
    if not api_key:
        logger.info("RESEND_API_KEY не задан — пропускаю weekly report для %s", to_email)
        return False

    try:
        import resend
        resend.api_key = api_key
    except ImportError:
        logger.warning("resend SDK не установлен")
        return False

    safe_name = html.escape(seller_name) if seller_name else ""
    greeting = f"Привет{', ' + safe_name if safe_name else ''}!"
    app_url = _app_url()

    html_body = f"""<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;color:#0f172a;max-width:680px;margin:0 auto;padding:24px">
<h2 style="color:#0f766e;margin:0 0 16px">Veloseller — еженедельный отчёт</h2>
<p>{greeting}</p>
<p>Прикрепили Excel с тремя листами:</p>
<ul>
<li><b>Сводка по складу</b> — Health Score, потери, замороженные деньги, SKU-счётчики</li>
<li><b>Потерянные продажи</b> — товары которые быстро продаются и часто заканчиваются</li>
<li><b>Замороженные остатки</b> — товары с покрытием &gt; 180 дней и замороженные деньги</li>
</ul>
<p style="margin-top:24px"><a href="{app_url}/dashboard" style="display:inline-block;background:#0f766e;color:white;padding:10px 20px;border-radius:8px;text-decoration:none">Перейти в дашборд</a></p>
<p style="color:#64748b;font-size:12px;margin-top:32px">Отписаться от еженедельных отчётов можно в настройках профиля.</p>
</body></html>"""

    try:
        resend.Emails.send({
            "from": from_email,
            "to": [to_email],
            "subject": "Veloseller — еженедельный отчёт",
            "html": html_body,
            "attachments": [{
                "filename": filename,
                "content": base64.b64encode(xlsx_bytes).decode("ascii"),
            }],
        })
        logger.info("weekly report email sent", extra={"to": to_email, "size": len(xlsx_bytes)})
        return True
    except Exception as e:
        logger.exception(f"Resend weekly report failed for {to_email}: {e}")
        return False


def send_report_email(
    to_email: str,
    seller_name: Optional[str],
    kinds: list[str],
    sku_counts: dict[str, int],
    xlsx_bytes: bytes,
    filename: str,
) -> tuple[bool, Optional[str]]:
    """Универсальная отправка Excel-отчёта.

    Правка Пункт 1 (25.05.2026): возвращает (success, error_text) вместо bool.

    Александр 01.06.2026: лейблы листов в письме синхронизированы с
    переименованиями в Excel (см. _KIND_LABELS вверху).
    """
    api_key = os.getenv("RESEND_API_KEY")
    from_email = os.getenv("RESEND_FROM", "Veloseller <noreply@veloseller.ru>")
    if not api_key:
        logger.info("RESEND_API_KEY не задан — пропускаю report для %s", to_email)
        return False, "RESEND_API_KEY not configured"

    try:
        import resend
        resend.api_key = api_key
    except ImportError:
        logger.warning("resend SDK не установлен")
        return False, "resend SDK not installed"

    safe_name = html.escape(seller_name) if seller_name else ""
    greeting = f"Привет{', ' + safe_name if safe_name else ''}!"
    app_url = _app_url()

    list_items = []
    for kind in kinds:
        label = html.escape(_KIND_LABELS.get(kind, kind))
        n = sku_counts.get(kind, 0)
        if kind == "weekly_report":
            # Сводка — не SKU, не показываем число
            list_items.append(f"<li><b>{label}</b></li>")
        elif n > 0:
            list_items.append(f"<li><b>{label}</b> — {n} SKU</li>")
    items_html = "\n".join(list_items) or "<li>Данных нет</li>"

    from datetime import datetime as _dt
    today_str = _dt.utcnow().strftime("%d.%m.%Y")
    subject = f"Veloseller — Отчёт от {today_str}"

    html_body = f"""<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;color:#0f172a;max-width:680px;margin:0 auto;padding:24px">
<h2 style="color:#0f766e;margin:0 0 16px">Veloseller — отчёты склада</h2>
<p>{greeting}</p>
<p>По расписанию сформирован Excel-файл со следующими листами:</p>
<ul>
{items_html}
</ul>
<p style="margin-top:24px"><a href="{app_url}/dashboard/alerts" style="display:inline-block;background:#0f766e;color:white;padding:10px 20px;border-radius:8px;text-decoration:none">История отчётов</a></p>
<p style="color:#64748b;font-size:12px;margin-top:32px">Настроить периодичность и состав отчётов можно в <a href="{app_url}/dashboard/alerts/subscriptions" style="color:#0f766e">настройках</a>.</p>
</body></html>"""

    try:
        response = resend.Emails.send({
            "from": from_email,
            "to": [to_email],
            "subject": subject,
            "html": html_body,
            "attachments": [{
                "filename": filename,
                "content": base64.b64encode(xlsx_bytes).decode("ascii"),
            }],
        })
    except Exception as e:
        err_text = f"{type(e).__name__}: {str(e)[:250]}"
        logger.exception(
            "Resend report email failed for %s: %s", to_email, err_text
        )
        return False, err_text

    msg_id = _extract_resend_msg_id(response)
    if not msg_id:
        resp_repr = repr(response)[:200] if response is not None else "None"
        logger.warning(
            "resend returned no message id for %s: type=%s repr=%s",
            to_email, type(response).__name__, resp_repr,
        )
        return False, f"no message id (response: {type(response).__name__})"

    logger.info("report email sent", extra={
        "to": to_email, "size": len(xlsx_bytes), "kinds": kinds,
        "resend_id": msg_id,
    })
    return True, None


# ─── Месячный PDF-отчёт ─────────────────────────────────────────────

def send_monthly_report_email(
    to_email: str,
    seller_name: Optional[str],
    pdf_bytes: bytes,
    filename: str,
    period_label: str,
) -> tuple[bool, Optional[str]]:
    """Шлёт месячный PDF-отчёт.

    Александр 01.06.2026: автоматическая рассылка в начале месяца.
    Формат — PDF (управленческий). Excel-эквивалент шлётся отдельно
    как еженедельный отчёт.
    """
    api_key = os.getenv("RESEND_API_KEY")
    from_email = os.getenv("RESEND_FROM", "Veloseller <noreply@veloseller.ru>")
    if not api_key:
        logger.info("RESEND_API_KEY не задан — пропускаю monthly report для %s", to_email)
        return False, "RESEND_API_KEY not configured"

    try:
        import resend
        resend.api_key = api_key
    except ImportError:
        logger.warning("resend SDK не установлен")
        return False, "resend SDK not installed"

    safe_name = html.escape(seller_name) if seller_name else ""
    greeting = f"Привет{', ' + safe_name if safe_name else ''}!"
    period_safe = html.escape(period_label)
    app_url = _app_url()
    subject = f"Veloseller Monthly Report — {period_label}"

    html_body = f"""<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;color:#0f172a;max-width:680px;margin:0 auto;padding:24px">
<h2 style="color:#0f766e;margin:0 0 16px">Veloseller Monthly Report</h2>
<p>{greeting}</p>
<p>Сводный управленческий отчёт за <b>{period_safe}</b>. Сравнение с предыдущим месяцем.</p>
<p>В отчёте:</p>
<ul>
<li>Сводные данные — Health Score, потери, заморожено, OOS</li>
<li>Что изменилось — позитивные и негативные изменения</li>
<li>Деньги — топ-10 потерь и топ-10 замороженных SKU</li>
<li>Динамика TVelo — топ роста и падения спроса</li>
<li>Сегментация склада — Fast Movers / Stable / Slow / Dead Inventory</li>
<li>Концентрация — где 50% денег и 50% спроса</li>
<li>Качество данных</li>
</ul>
<p style="margin-top:24px"><a href="{app_url}/dashboard" style="display:inline-block;background:#0f766e;color:white;padding:10px 20px;border-radius:8px;text-decoration:none">Открыть дашборд</a></p>
<p style="color:#64748b;font-size:12px;margin-top:32px">Месячные отчёты приходят автоматически в начале каждого месяца. Отключить можно в настройках профиля.</p>
</body></html>"""

    try:
        response = resend.Emails.send({
            "from": from_email,
            "to": [to_email],
            "subject": subject,
            "html": html_body,
            "attachments": [{
                "filename": filename,
                "content": base64.b64encode(pdf_bytes).decode("ascii"),
            }],
        })
    except Exception as e:
        err_text = f"{type(e).__name__}: {str(e)[:250]}"
        logger.exception("Resend monthly report failed for %s: %s", to_email, err_text)
        return False, err_text

    msg_id = _extract_resend_msg_id(response)
    if not msg_id:
        return False, f"no message id (response: {type(response).__name__})"

    logger.info("monthly report email sent", extra={
        "to": to_email, "size": len(pdf_bytes), "period": period_label,
        "resend_id": msg_id,
    })
    return True, None
