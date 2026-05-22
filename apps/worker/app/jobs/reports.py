"""Универсальный диспетчер еженедельных Excel-отчётов.

Архитектура (этап 2 перехода «алерты → отчёты»):

- Каждый день в 09:00 UTC запускается `dispatch_daily_reports()`
- Для каждого seller'а ищем все enabled подписки в notification_subscriptions
  где params.day_of_week = isoweekday(today)
- Группируем подписки по (seller_id, channel) — если несколько kinds на один день
  → один XLSX с разными листами
- Для каждого kind свой fetcher (SKU + значение характеристики из фильтра)
  и свой sheet-builder (колонки)
- Отправка: email (Resend attachment) или telegram (Bot API sendDocument)
- Запись в report_history с проверкой idempotency (не шлём дважды за день)

Дефолтный набор подписок создаётся триггером trg_create_default_subscriptions
при INSERT нового seller'а. У существующих доолотся миграцией.
"""
from __future__ import annotations

import io
import logging
from collections import defaultdict
from datetime import date, datetime, timezone
from typing import Any, Optional

from app.db import fetch_all, get_supabase

logger = logging.getLogger("veloseller.reports")


# ─── Forматирование ───────────────────────────────────────────────────────────

def _format_money(value: Any, currency: str = "RUB") -> str:
    if value is None:
        return "—"
    try:
        num = float(value)
    except (TypeError, ValueError):
        return "—"
    sign = "₽" if currency == "RUB" else currency
    return f"{num:,.0f} {sign}".replace(",", " ")


def _bold(cell, color: str = "0F172A") -> None:
    from openpyxl.styles import Font
    cell.font = Font(bold=True, color=color)


def _column_widths(ws, widths: dict[str, int]) -> None:
    for col_letter, width in widths.items():
        ws.column_dimensions[col_letter].width = width


# ─── Метаданные kinds (label + sheet builder) ────────────────────────────────

# Лимит SKU на лист. Чтобы у Resend письма не выходили за 25 МБ,
# и не было гигантских Excel который никто не откроет.
SHEET_ROW_LIMIT = 500


KIND_LABELS = {
    "low_stock":          "Низкий остаток",
    "critical_stock":     "Критический остаток",
    "dead_inventory":     "Неликвид",
    "repeated_stockout":  "Частый out-of-stock",
    "underestimated_sku": "Недооценённый SKU",
    "sync_error":         "Ошибки синхронизации",
    "weekly_report":      "Сводка по складу",
}


# Имена листов Excel ограничены 31 символом — все наши labels влезают.
def _sheet_name(kind: str) -> str:
    return KIND_LABELS.get(kind, kind)[:31]


# ─── Fetchers: получение SKU по kind ─────────────────────────────────────────

def _fetch_sku_rows(sb, seller_id: str, kind: str, params: dict) -> list[dict]:
    """Возвращает строки для листа Excel в формате [{sku, name, ...}, ...].

    Каждый kind имеет свой набор колонок и фильтр. См. _build_sheet_for_kind
    для соответствия kind ↔ колонки.
    """
    try:
        if kind == "low_stock":
            threshold = int(params.get("coverage_days_threshold", 7))
            res = (
                sb.table("tvelo_metrics")
                .select("coverage_days,current_stock,adjusted_velocity,products!inner(sku,product_name,seller_id)")
                .eq("products.seller_id", seller_id)
                .lte("coverage_days", threshold)
                .gt("current_stock", 0)
                .gt("adjusted_velocity", 0)
                .order("coverage_days")
                .limit(SHEET_ROW_LIMIT)
                .execute()
            )
            return res.data or []

        if kind == "critical_stock":
            threshold = int(params.get("coverage_days_threshold", 3))
            res = (
                sb.table("tvelo_metrics")
                .select("coverage_days,current_stock,adjusted_velocity,products!inner(sku,product_name,seller_id)")
                .eq("products.seller_id", seller_id)
                .lte("coverage_days", threshold)
                .gt("current_stock", 0)
                .gt("adjusted_velocity", 0)
                .order("coverage_days")
                .limit(SHEET_ROW_LIMIT)
                .execute()
            )
            return res.data or []

        if kind == "dead_inventory":
            threshold = int(params.get("coverage_days_threshold", 180))
            res = (
                sb.table("tvelo_metrics")
                .select("coverage_days,adjusted_velocity,frozen_inventory_value,current_stock,products!inner(sku,product_name,seller_id)")
                .eq("products.seller_id", seller_id)
                .gt("coverage_days", threshold)
                .order("frozen_inventory_value", desc=True)
                .limit(SHEET_ROW_LIMIT)
                .execute()
            )
            return res.data or []

        if kind == "repeated_stockout":
            threshold = int(params.get("stockout_days_threshold", 3))
            res = (
                sb.table("tvelo_metrics")
                .select("stockout_days,adjusted_velocity,coverage_days,products!inner(sku,product_name,seller_id)")
                .eq("products.seller_id", seller_id)
                .gte("stockout_days", threshold)
                .order("stockout_days", desc=True)
                .limit(SHEET_ROW_LIMIT)
                .execute()
            )
            return res.data or []

        if kind == "underestimated_sku":
            res = (
                sb.table("tvelo_metrics")
                .select("adjusted_velocity,median_30d_velocity,stockout_days,products!inner(sku,product_name,seller_id),underestimated_sku")
                .eq("products.seller_id", seller_id)
                .eq("underestimated_sku", True)
                .order("adjusted_velocity", desc=True)
                .limit(SHEET_ROW_LIMIT)
                .execute()
            )
            return res.data or []

        if kind == "sync_error":
            # Тут листингуем data_connections с status='error' — это не SKU,
            # но тоже строки для отчёта.
            res = (
                sb.table("data_connections")
                .select("name,source,marketplace,last_error,last_sync_at,status")
                .eq("seller_id", seller_id)
                .eq("status", "error")
                .order("last_sync_at", desc=True)
                .limit(SHEET_ROW_LIMIT)
                .execute()
            )
            return res.data or []

        if kind == "weekly_report":
            # Сводка: последние 14 store_metrics
            res = (
                sb.table("store_metrics")
                .select("*")
                .eq("seller_id", seller_id)
                .order("period_end", desc=True)
                .limit(14)
                .execute()
            )
            return res.data or []

    except Exception:
        logger.exception("_fetch_sku_rows failed kind=%s seller=%s", kind, seller_id)

    return []


# ─── Sheet builders: рисуют лист в Excel под конкретный kind ──────────────────

def _row_product(r: dict) -> tuple[str, str]:
    """Извлекает sku/product_name из вложенного products. Защита от list/dict."""
    p = r.get("products") or {}
    if isinstance(p, list):
        p = p[0] if p else {}
    return (p.get("sku") or "—", p.get("product_name") or "—")


def _build_sheet_for_kind(wb, kind: str, rows: list[dict], currency: str) -> None:
    """Один лист на один kind. Колонки: SKU / Название / Значение характеристики."""
    ws = wb.create_sheet(_sheet_name(kind))

    if kind in ("low_stock", "critical_stock"):
        headers = ["SKU", "Название", "Покрытие (дн)", "Остаток", "Скорость (шт/день)"]
        ws.append(headers)
        for col in range(1, len(headers) + 1):
            _bold(ws.cell(row=1, column=col))
        for r in rows:
            sku, name = _row_product(r)
            ws.append([
                sku, name,
                int(r.get("coverage_days") or 0),
                int(r.get("current_stock") or 0),
                round(float(r.get("adjusted_velocity") or 0), 2),
            ])
        _column_widths(ws, {"A": 22, "B": 42, "C": 14, "D": 12, "E": 18})

    elif kind == "dead_inventory":
        headers = ["SKU", "Название", "Покрытие (дн)", "Скорость (шт/день)", "Заморожено"]
        ws.append(headers)
        for col in range(1, len(headers) + 1):
            _bold(ws.cell(row=1, column=col))
        for r in rows:
            sku, name = _row_product(r)
            ws.append([
                sku, name,
                int(r.get("coverage_days") or 0),
                round(float(r.get("adjusted_velocity") or 0), 2),
                _format_money(r.get("frozen_inventory_value"), currency),
            ])
        _column_widths(ws, {"A": 22, "B": 42, "C": 14, "D": 18, "E": 18})

    elif kind == "repeated_stockout":
        headers = ["SKU", "Название", "Дней OOS (30д)", "Скорость (шт/день)", "Покрытие (дн)"]
        ws.append(headers)
        for col in range(1, len(headers) + 1):
            _bold(ws.cell(row=1, column=col))
        for r in rows:
            sku, name = _row_product(r)
            ws.append([
                sku, name,
                int(r.get("stockout_days") or 0),
                round(float(r.get("adjusted_velocity") or 0), 2),
                int(r.get("coverage_days") or 0),
            ])
        _column_widths(ws, {"A": 22, "B": 42, "C": 16, "D": 18, "E": 14})

    elif kind == "underestimated_sku":
        headers = ["SKU", "Название", "Скорость (шт/день)", "Медиана 30д", "OOS дней"]
        ws.append(headers)
        for col in range(1, len(headers) + 1):
            _bold(ws.cell(row=1, column=col))
        for r in rows:
            sku, name = _row_product(r)
            ws.append([
                sku, name,
                round(float(r.get("adjusted_velocity") or 0), 2),
                round(float(r.get("median_30d_velocity") or 0), 2),
                int(r.get("stockout_days") or 0),
            ])
        _column_widths(ws, {"A": 22, "B": 42, "C": 18, "D": 16, "E": 12})

    elif kind == "sync_error":
        headers = ["Склад", "Тип", "Последняя ошибка", "Время"]
        ws.append(headers)
        for col in range(1, len(headers) + 1):
            _bold(ws.cell(row=1, column=col))
        kind_label = {
            "ozon_fbo": "Ozon FBO", "ozon_fbs": "Ozon FBS",
            "wb_fbo": "Wildberries FBO", "wb_fbs": "Wildberries FBS",
            "google_sheet": "Google Sheet",
        }
        for r in rows:
            mp = r.get("marketplace") or r.get("source") or ""
            ws.append([
                r.get("name") or "—",
                kind_label.get(mp, mp),
                (r.get("last_error") or "")[:500],
                (r.get("last_sync_at") or "")[:19].replace("T", " "),
            ])
        _column_widths(ws, {"A": 26, "B": 18, "C": 60, "D": 20})

    elif kind == "weekly_report":
        headers = [
            "Дата", "Всего SKU", "Нет в наличии", "Низкий остаток",
            "Неликвид (SKU)", "Health", "Остатки", "Заморожено", "Потерянная выручка",
        ]
        ws.append(headers)
        for col in range(1, len(headers) + 1):
            _bold(ws.cell(row=1, column=col))
        for m in rows:
            ws.append([
                (m.get("period_end") or "")[:10],
                m.get("total_sku_count") or 0,
                m.get("oos_sku_count") or 0,
                m.get("low_stock_sku_count") or 0,
                m.get("dead_inventory_sku_count") or 0,
                round(float(m.get("warehouse_health_score") or 0), 1),
                _format_money(m.get("total_inventory_value"), currency),
                _format_money(m.get("store_frozen_inventory_value"), currency),
                _format_money(m.get("lost_revenue"), currency),
            ])
        _column_widths(ws, {
            "A": 12, "B": 12, "C": 14, "D": 14, "E": 14, "F": 10,
            "G": 18, "H": 18, "I": 20,
        })

    else:
        # Fallback для незнакомого kind — на случай добавления нового в БД без обновления кода.
        ws.append(["Данные", "Значение"])
        _bold(ws.cell(row=1, column=1))
        _bold(ws.cell(row=1, column=2))
        for i, r in enumerate(rows[:50]):
            ws.append([f"Запись {i+1}", str(r)[:200]])

    ws.freeze_panes = "A2"


def _build_xlsx(kind_rows: dict[str, list[dict]], currency: str) -> bytes:
    """Сборка XLSX из набора (kind → строки). Пустые листы пропускаем."""
    from openpyxl import Workbook
    wb = Workbook()
    if "Sheet" in wb.sheetnames:
        del wb["Sheet"]

    has_data = False
    # Стабильный порядок листов — по приоритету для глаза менеджера.
    priority = [
        "critical_stock", "low_stock", "repeated_stockout",
        "underestimated_sku", "dead_inventory", "sync_error", "weekly_report",
    ]
    for kind in priority:
        rows = kind_rows.get(kind) or []
        if not rows:
            continue
        _build_sheet_for_kind(wb, kind, rows, currency)
        has_data = True

    # Если ВСЕ листы пустые — добавляем placeholder, чтобы файл был валидным XLSX.
    if not has_data:
        ws = wb.create_sheet("Пусто")
        ws.append(["Нет данных для отчётов за этот период."])

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ─── Dispatcher ───────────────────────────────────────────────────────────────

def _today_iso_date() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _already_sent_today(sb, seller_id: str, channel: str) -> bool:
    """Idempotency: за один день одна отправка на канал."""
    try:
        res = (
            sb.table("report_history")
            .select("id")
            .eq("seller_id", seller_id)
            .eq("channel", channel)
            .eq("sent_date", _today_iso_date())
            .limit(1)
            .execute()
        )
        return bool(res.data)
    except Exception:
        logger.exception("idempotency check failed seller=%s", seller_id)
        return False


def _record_history(
    sb,
    seller_id: str,
    day_of_week: int,
    kinds: list[str],
    channel: str,
    status: str,
    sku_counts: dict[str, int],
    filename: Optional[str],
    file_size: Optional[int],
    error: Optional[str],
) -> None:
    try:
        sb.table("report_history").insert({
            "seller_id": seller_id,
            "day_of_week": day_of_week,
            "kinds": kinds,
            "channel": channel,
            "status": status,
            "sku_counts": sku_counts,
            "file_name": filename,
            "file_size_bytes": file_size,
            "error_message": error,
        }).execute()
    except Exception:
        logger.exception("failed to insert report_history seller=%s", seller_id)


def dispatch_daily_reports() -> None:
    """Главный entry-point cron-задачи.

    Каждое утро (09:00 UTC) проходимся по всем enabled подпискам,
    у которых params.day_of_week == isoweekday(today). Группируем по
    (seller_id, channel), для каждой группы собираем один XLSX и отправляем.
    """
    try:
        sb = get_supabase()
        today_dow = datetime.now(timezone.utc).isoweekday()  # 1=пн … 7=вс

        all_subs = fetch_all(
            sb.table("notification_subscriptions")
            .select("seller_id,kind,channel,enabled,params")
            .eq("enabled", True)
        )

        # group_key: (seller_id, channel) → list[sub]
        groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
        for sub in all_subs:
            params = sub.get("params") or {}
            try:
                dow = int(params.get("day_of_week", 1))
            except (ValueError, TypeError):
                dow = 1
            if dow != today_dow:
                continue
            groups[(sub["seller_id"], sub["channel"])].append(sub)

        if not groups:
            logger.info("dispatch_daily_reports: nothing scheduled for dow=%d", today_dow)
            return

        sent_email = 0
        sent_telegram = 0
        skipped = 0
        failed = 0

        for (seller_id, channel), subs_list in groups.items():
            # Idempotency
            if _already_sent_today(sb, seller_id, channel):
                logger.info("skip (already sent today) seller=%s channel=%s", seller_id, channel)
                skipped += 1
                continue

            try:
                seller_res = (
                    sb.table("sellers")
                    .select("id,email,display_name,currency,telegram_chat_id,notify_email,notify_telegram")
                    .eq("id", seller_id)
                    .single()
                    .execute()
                )
                seller = seller_res.data
            except Exception:
                logger.exception("seller fetch failed %s", seller_id)
                failed += 1
                continue

            if not seller:
                skipped += 1
                continue

            # Глобальный opt-out по каналу
            if channel == "email" and not seller.get("notify_email", True):
                skipped += 1
                continue
            if channel == "telegram" and not seller.get("notify_telegram", True):
                skipped += 1
                continue

            currency = seller.get("currency") or "RUB"
            kinds = sorted({s["kind"] for s in subs_list})

            # Fetch + count
            kind_rows: dict[str, list[dict]] = {}
            sku_counts: dict[str, int] = {}
            params_by_kind = {s["kind"]: (s.get("params") or {}) for s in subs_list}
            for kind in kinds:
                rows = _fetch_sku_rows(sb, seller_id, kind, params_by_kind[kind])
                kind_rows[kind] = rows
                sku_counts[kind] = len(rows)

            total_sku = sum(sku_counts.values())
            if total_sku == 0:
                logger.info("skip (no data) seller=%s channel=%s kinds=%s",
                            seller_id, channel, kinds)
                _record_history(sb, seller_id, today_dow, kinds, channel,
                                "skipped", sku_counts, None, None, "no data")
                skipped += 1
                continue

            # Build XLSX
            try:
                xlsx_bytes = _build_xlsx(kind_rows, currency)
            except Exception:
                logger.exception("xlsx build failed seller=%s", seller_id)
                _record_history(sb, seller_id, today_dow, kinds, channel,
                                "failed", sku_counts, None, None, "xlsx build error")
                failed += 1
                continue

            today = date.today().isoformat()
            filename = f"veloseller-otchet-{today}.xlsx"

            # Send
            success = False
            error_msg: Optional[str] = None
            if channel == "email":
                if seller.get("email"):
                    try:
                        from app.notifications import send_report_email
                        success = send_report_email(
                            to_email=seller["email"],
                            seller_name=seller.get("display_name"),
                            kinds=kinds,
                            sku_counts=sku_counts,
                            xlsx_bytes=xlsx_bytes,
                            filename=filename,
                        )
                    except Exception as e:
                        logger.exception("send email failed %s", seller_id)
                        error_msg = str(e)[:200]
                else:
                    error_msg = "no email"
            elif channel == "telegram":
                if seller.get("telegram_chat_id"):
                    try:
                        from app.telegram import send_document
                        caption = _build_telegram_caption(kinds, sku_counts)
                        success = send_document(
                            chat_id=seller["telegram_chat_id"],
                            file_bytes=xlsx_bytes,
                            filename=filename,
                            caption=caption,
                        )
                    except Exception as e:
                        logger.exception("send telegram failed %s", seller_id)
                        error_msg = str(e)[:200]
                else:
                    error_msg = "no telegram_chat_id"

            if success:
                _record_history(sb, seller_id, today_dow, kinds, channel,
                                "sent", sku_counts, filename, len(xlsx_bytes), None)
                if channel == "email":
                    sent_email += 1
                else:
                    sent_telegram += 1
            else:
                _record_history(sb, seller_id, today_dow, kinds, channel,
                                "failed", sku_counts, filename, len(xlsx_bytes),
                                error_msg or "send returned False")
                failed += 1

        logger.info(
            "dispatch_daily_reports done dow=%d groups=%d email=%d tg=%d skipped=%d failed=%d",
            today_dow, len(groups), sent_email, sent_telegram, skipped, failed,
        )
    except Exception:
        logger.exception("dispatch_daily_reports crashed")


def _build_telegram_caption(kinds: list[str], sku_counts: dict[str, int]) -> str:
    """HTML-caption под Excel-файлом в Telegram. Должно влезать <1024 символов."""
    import html
    lines = ["📊 <b>Veloseller — отчёты</b>", ""]
    for kind in kinds:
        label = html.escape(KIND_LABELS.get(kind, kind))
        n = sku_counts.get(kind, 0)
        if n > 0:
            lines.append(f"• {label}: <b>{n}</b> SKU")
    return "\n".join(lines)
