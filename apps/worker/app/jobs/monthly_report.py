"""Месячный управленческий PDF-отчёт.

Александр 01.06.2026 (Veloseller_Отчёт.txt):
- Отправляется автоматически в начале месяца (1-го числа в 09:00 UTC)
- Формат: PDF (управленческий, в отличие от еженедельного Excel-операционного)
- Сравнение текущего месяца с предыдущим

7 секций по ТЗ:
1. Сводные данные         (Health, потери, заморожено, OOS, средний TVelo +дельты)
2. Что изменилось         (Позитивные/Негативные изменения)
3. Деньги                 (TOP-10 потерь / TOP-10 замороженных)
4. Динамика TVelo         (TOP роста / TOP падения по SKU)
5. Сегментация склада     (Fast/Stable/Slow/Dead Inventory)
6. Концентрация           (50% денег в N SKU / 50% спроса в M SKU)
7. Качество данных        (confidence, пополнения, аномалии)

Реализация:
- Запускается ежемесячно 1-го числа в 09:00 UTC через scheduler
- Идемпотентность через monthly_report_history (отдельная таблица, не пересекается
  с report_history который для еженедельных)
- PDF строится через reportlab — простой layout, не WYSIWYG
"""
from __future__ import annotations

import io
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from app.db import get_supabase
from app.jobs.period_window import latest_30d_window, store_metric_30d

logger = logging.getLogger("veloseller.monthly_report")


# ─── Утилиты ─────────────────────────────────────────────

def _format_money_short(value: Any, currency: str = "RUB") -> str:
    """Компактный формат: 1.5M ₽, 230K ₽, 5 600 ₽."""
    if value is None:
        return "—"
    try:
        num = float(value)
    except (TypeError, ValueError):
        return "—"
    sign = "₽" if currency == "RUB" else currency
    abs_n = abs(num)
    if abs_n >= 1_000_000:
        return f"{num/1_000_000:.1f} млн {sign}"
    if abs_n >= 1_000:
        return f"{num/1_000:.0f} тыс {sign}"
    return f"{num:.0f} {sign}"


def _format_money(value: Any, currency: str = "RUB") -> str:
    """Полный формат с пробелами: 1 234 567 ₽."""
    if value is None:
        return "—"
    try:
        num = float(value)
    except (TypeError, ValueError):
        return "—"
    sign = "₽" if currency == "RUB" else currency
    return f"{num:,.0f} {sign}".replace(",", " ")


def _format_pct_delta(curr: Any, prev: Any) -> str:
    """+18% / -11% / без изменений / н/д. Возвращает строку для PDF."""
    try:
        c = float(curr) if curr is not None else None
        p = float(prev) if prev is not None else None
    except (TypeError, ValueError):
        return "н/д"
    if c is None or p is None or p == 0:
        return "н/д"
    delta = (c - p) / p * 100
    if abs(delta) < 0.5:
        return "≈"
    sign = "+" if delta > 0 else ""
    return f"{sign}{delta:.0f}%"


def _format_abs_delta(curr: Any, prev: Any) -> str:
    """+5 / -3 / 0. Для целочисленных счётчиков."""
    try:
        c = int(curr) if curr is not None else 0
        p = int(prev) if prev is not None else 0
    except (TypeError, ValueError):
        return "н/д"
    delta = c - p
    if delta == 0:
        return "0"
    sign = "+" if delta > 0 else ""
    return f"{sign}{delta}"


def _month_label(d: date) -> str:
    """1 мая 2026 → 'май 2026'."""
    months_ru = [
        "январь", "февраль", "март", "апрель", "май", "июнь",
        "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
    ]
    return f"{months_ru[d.month - 1]} {d.year}"


def _previous_month_period(today: date) -> tuple[date, date]:
    """Вернёт (period_start, period_end) предыдущего календарного месяца.

    Например для today=2026-06-01 → (2026-05-01, 2026-05-31).
    """
    first_of_this = today.replace(day=1)
    last_of_prev = first_of_this - timedelta(days=1)
    first_of_prev = last_of_prev.replace(day=1)
    return (first_of_prev, last_of_prev)


def _two_months_back(today: date) -> tuple[date, date]:
    """Период за позапрошлый месяц — для сравнения предыдущего с ним."""
    prev_start, _ = _previous_month_period(today)
    last_of_two_back = prev_start - timedelta(days=1)
    first_of_two_back = last_of_two_back.replace(day=1)
    return (first_of_two_back, last_of_two_back)


# ─── Сбор данных ─────────────────────────────────────────

def _fetch_store_metric_for_date(sb, seller_id: str, target_date: date) -> Optional[dict]:
    """store_metrics 30-дневного окна, ближайший (но не позже) к target_date.
    store_metrics пишется по окнам 7/30/90 — для месячного отчёта берём 30-дневное
    (раньше .limit(1) брал случайное окно, обычно 90-дневное → цифры за 3 месяца)."""
    return store_metric_30d(sb, seller_id, target_date)


def _fetch_period_skus(sb, seller_id: str, period_start: date, period_end: date) -> dict[str, dict]:
    """Метрики ПО SKU строго за период [period_start, period_end] через RPC
    get_skus_period_metrics (считает из снэпшотов/событий, НЕ из текущего
    tvelo_metrics) — поэтому данные относятся именно к отчётному месяцу.

    Скорость = продажи за период / дни в наличии (помесячная скорость).
    Возвращает {product_id: {sku, product_name, velocity, stockout_days,
    current_stock, current_price, coverage_days, lost_revenue}}.
    """
    try:
        prod_res = (
            sb.table("products")
            .select("product_id,sku,product_name")
            .eq("seller_id", seller_id)
            .execute()
        )
        products = prod_res.data or []
    except Exception:
        logger.exception("period skus: продукты не получены seller=%s", seller_id)
        return {}
    if not products:
        return {}
    names = {p["product_id"]: p for p in products}
    try:
        res = sb.rpc("get_skus_period_metrics", {
            "p_seller_id": seller_id,
            "p_connection_id": None,  # весь магазин (все склады)
            "p_period_start": period_start.isoformat(),
            "p_period_end": period_end.isoformat(),
            "p_product_ids": list(names.keys()),
        }).execute()
        rows = res.data or []
    except Exception:
        logger.exception("period skus RPC failed seller=%s", seller_id)
        return {}
    out: dict[str, dict] = {}
    for r in rows:
        pid = r.get("product_id")
        if pid is None:
            continue
        meta = names.get(pid, {})
        out[pid] = {
            "sku": meta.get("sku"),
            "product_name": meta.get("product_name"),
            "velocity": float(r.get("velocity") or 0),
            "stockout_days": int(r.get("stockout_days") or 0),
            "current_stock": int(r.get("current_stock") or 0),
            "current_price": float(r.get("current_price") or 0),
            "coverage_days": float(r["coverage_days"]) if r.get("coverage_days") is not None else None,
            "lost_revenue": float(r.get("lost_revenue") or 0),
        }
    return out


def _top_lost_from_period(period_skus: dict[str, dict], limit: int = 10) -> list[dict]:
    """ТОП-N SKU по потерянной выручке ЗА ПЕРИОД (RPC уже посчитал lost_revenue)."""
    rows = []
    for m in period_skus.values():
        lost = m.get("lost_revenue") or 0
        if lost > 0:
            rows.append({"products": {"sku": m["sku"], "product_name": m["product_name"]}, "_lost": lost})
    rows.sort(key=lambda r: r["_lost"], reverse=True)
    return rows[:limit]


def _top_frozen_from_period(period_skus: dict[str, dict], limit: int = 10) -> list[dict]:
    """ТОП-N SKU по замороженным деньгам (current_stock × current_price на конец
    периода) среди тех, у кого coverage > 180 дней."""
    rows = []
    for m in period_skus.values():
        cov = m.get("coverage_days")
        frozen = (m.get("current_stock") or 0) * (m.get("current_price") or 0)
        if cov is not None and cov > 180 and frozen > 0:
            rows.append({"products": {"sku": m["sku"], "product_name": m["product_name"]}, "_frozen": frozen})
    rows.sort(key=lambda r: r["_frozen"], reverse=True)
    return rows[:limit]


def _movers_from_periods(
    period_now: dict[str, dict], period_prev: dict[str, dict], limit: int = 5,
) -> tuple[list[dict], list[dict]]:
    """ТОП роста/падения скорости месяц-к-месяцу: текущий отчётный месяц vs
    предыдущий. Только SKU, где скорость > 0 в ОБОИХ месяцах (иначе дельта без
    смысла). median_30d_velocity здесь = скорость прошлого месяца (колонка
    «поз. мес.»), adjusted_velocity = скорость текущего месяца."""
    rows = []
    for pid, m in period_now.items():
        v_now = m.get("velocity") or 0
        prev = period_prev.get(pid)
        v_prev = (prev.get("velocity") or 0) if prev else 0
        if v_now > 0 and v_prev > 0:
            rows.append({
                "products": {"sku": m["sku"], "product_name": m["product_name"]},
                "median_30d_velocity": v_prev,
                "adjusted_velocity": v_now,
                "_delta_pct": (v_now - v_prev) / v_prev * 100,
            })
    growth = sorted(rows, key=lambda r: r["_delta_pct"], reverse=True)[:limit]
    decline = sorted(rows, key=lambda r: r["_delta_pct"])[:limit]
    return growth, decline


def _segments_from_period(period_skus: dict[str, dict]) -> dict[str, dict[str, float]]:
    """Сегментация склада за период по coverage_days (как inventory_segment в
    движке): fast<14, stable≤60, slow≤180, dead>180, иначе insufficient_data.
    value = сумма current_stock × current_price по сегменту."""
    result: dict[str, dict[str, float]] = {}
    for m in period_skus.values():
        cov = m.get("coverage_days")
        if cov is None:
            seg = "insufficient_data"
        elif cov < 14:
            seg = "fast_movers"
        elif cov <= 60:
            seg = "stable"
        elif cov <= 180:
            seg = "slow_movers"
        else:
            seg = "dead_inventory_risk"
        value = (m.get("current_stock") or 0) * (m.get("current_price") or 0)
        if seg not in result:
            result[seg] = {"count": 0, "value": 0.0}
        result[seg]["count"] += 1
        result[seg]["value"] += value
    return result


def _fetch_data_quality(sb, seller_id: str, period_start: date, period_end: date) -> dict:
    """Качество данных за период: средний confidence, события."""
    try:
        # Средний confidence — ТЕКУЩЕЕ 30-дневное окно. tvelo_metrics пишется по
        # окнам 7/30/90 на каждый день; без фильтра усреднялось по всей истории×3.
        ps, pe = latest_30d_window(sb, seller_id)
        if ps and pe:
            cur_res = (
                sb.table("tvelo_metrics")
                .select("confidence_score,products!inner(seller_id)")
                .eq("products.seller_id", seller_id)
                .eq("period_start", ps)
                .eq("period_end", pe)
                .limit(5000)
                .execute()
            )
            cur_rows = cur_res.data or []
        else:
            cur_rows = []
        conf_vals = [float(r["confidence_score"]) for r in cur_rows if r.get("confidence_score") is not None]
        avg_conf = sum(conf_vals) / len(conf_vals) if conf_vals else None
    except Exception:
        logger.exception("avg confidence failed seller=%s", seller_id)
        avg_conf = None

    try:
        # Подсчёт событий за период
        ev_res = (
            sb.table("inventory_events")
            .select("event_type,products!inner(seller_id)")
            .eq("products.seller_id", seller_id)
            .gte("event_date", period_start.isoformat())
            .lte("event_date", period_end.isoformat())
            .limit(10000)
            .execute()
        )
        events = ev_res.data or []
    except Exception:
        logger.exception("events count failed seller=%s", seller_id)
        events = []

    replenishments = sum(1 for e in events if e.get("event_type") == "replenishment_like")
    anomalies = sum(1 for e in events if e.get("event_type") == "anomaly_like")
    missing = sum(1 for e in events if e.get("event_type") == "missing_data")

    return {
        "avg_confidence": avg_conf,
        "replenishments": replenishments,
        "anomalies": anomalies,
        "missing_data": missing,
    }


# ─── PDF builder ──────────────────────────────────────────

SEGMENT_LABELS = {
    "fast_movers":         "Fast Movers",
    "stable":              "Stable",
    "slow_movers":         "Slow Movers",
    "dead_inventory_risk": "Dead Inventory Risk",
    "insufficient_data":   "Insufficient Data",
}


def _build_pdf(seller_name: str, period_label: str, data: dict, currency: str) -> bytes:
    """Собирает PDF месячного отчёта.

    data — словарь с ключами:
      current_metric, previous_metric, top_lost, top_frozen,
      growth, decline, segments, data_quality
    """
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        PageBreak,
    )
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    # Попытка зарегистрировать DejaVuSans для кириллицы. Если не получится —
    # используем дефолтный шрифт (на проде в Docker DejaVu обычно ставится
    # пакетом fonts-dejavu — он входит в стандартный python:3.11-slim).
    # Fallback: Helvetica работает но кириллица будет в виде прямоугольников.
    import os
    font_name = "Helvetica"
    font_bold = "Helvetica-Bold"
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans.ttf",
    ):
        if os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont("DejaVuSans", path))
                bold_path = path.replace("DejaVuSans.ttf", "DejaVuSans-Bold.ttf")
                if os.path.exists(bold_path):
                    pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", bold_path))
                    font_bold = "DejaVuSans-Bold"
                else:
                    font_bold = "DejaVuSans"  # fallback
                font_name = "DejaVuSans"
                break
            except Exception:
                logger.exception("font registration failed for %s", path)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=1.5*cm, rightMargin=1.5*cm,
        topMargin=1.5*cm, bottomMargin=1.5*cm,
        title=f"Veloseller — месячный отчёт — {period_label}",
        author="Veloseller",
    )

    styles = getSampleStyleSheet()
    h1_style = ParagraphStyle(
        "h1", parent=styles["Heading1"],
        fontName=font_bold, fontSize=18, leading=22,
        textColor=colors.HexColor("#0f766e"), spaceBefore=0, spaceAfter=4,
    )
    h2_style = ParagraphStyle(
        "h2", parent=styles["Heading2"],
        fontName=font_bold, fontSize=13, leading=16,
        textColor=colors.HexColor("#0f172a"), spaceBefore=14, spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "body", parent=styles["BodyText"],
        fontName=font_name, fontSize=10, leading=13,
        textColor=colors.HexColor("#0f172a"),
    )
    muted_style = ParagraphStyle(
        "muted", parent=body_style,
        fontSize=9, textColor=colors.HexColor("#64748b"),
    )

    cur = data.get("current_metric") or {}
    prev = data.get("previous_metric") or {}

    story: list = []

    # ─── Заголовок ─────────────────────────────────────
    story.append(Paragraph("Veloseller — месячный отчёт", h1_style))
    story.append(Paragraph(f"{seller_name} · {period_label}", muted_style))
    story.append(Spacer(1, 0.4*cm))

    # ─── 1. Сводные данные ─────────────────────────────
    story.append(Paragraph("1. Сводные данные", h2_style))
    summary_rows = [
        ["Показатель", "Значение", "Изменение"],
        [
            "Inventory Health",
            f"{round(float(cur.get('warehouse_health_score') or 0))}/100" if cur.get('warehouse_health_score') is not None else "—",
            _format_abs_delta(cur.get("warehouse_health_score"), prev.get("warehouse_health_score")),
        ],
        [
            "Потерянная выручка",
            _format_money(cur.get("lost_revenue"), currency),
            _format_pct_delta(cur.get("lost_revenue"), prev.get("lost_revenue")),
        ],
        [
            "Заморожено в остатках",
            _format_money(cur.get("store_frozen_inventory_value"), currency),
            _format_pct_delta(cur.get("store_frozen_inventory_value"), prev.get("store_frozen_inventory_value")),
        ],
        [
            "SKU в OOS",
            str(cur.get("oos_sku_count") or 0),
            _format_abs_delta(cur.get("oos_sku_count"), prev.get("oos_sku_count")),
        ],
        [
            "Всего SKU",
            str(cur.get("total_sku_count") or 0),
            _format_abs_delta(cur.get("total_sku_count"), prev.get("total_sku_count")),
        ],
    ]
    t = Table(summary_rows, colWidths=[7*cm, 5*cm, 4*cm])
    t.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, 0), font_bold, 9),
        ("FONT", (0, 1), (-1, -1), font_name, 10),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0f766e")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f0fdf4")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("LINEBELOW", (0, 0), (-1, 0), 1, colors.HexColor("#0f766e")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(t)

    # ─── 2. Что изменилось ─────────────────────────────
    story.append(Paragraph("2. Что изменилось", h2_style))

    positives = []
    negatives = []

    def _push_change(target: list, label: str, c: Any, p: Any, lower_is_better: bool, fmt=str):
        try:
            cv = float(c) if c is not None else None
            pv = float(p) if p is not None else None
        except (TypeError, ValueError):
            return
        if cv is None or pv is None:
            return
        diff = cv - pv
        if abs(diff) < 0.5:  # порог "без изменений"
            return
        # better = (lower и diff<0) либо (higher и diff>0)
        is_better = (lower_is_better and diff < 0) or (not lower_is_better and diff > 0)
        line = f"{label}: {fmt(pv)} → {fmt(cv)}"
        if is_better:
            positives.append(line)
        else:
            negatives.append(line)

    _push_change(positives, "OOS SKU", cur.get("oos_sku_count"), prev.get("oos_sku_count"),
                 lower_is_better=True, fmt=lambda v: str(int(v)))
    _push_change(positives, "Потери", cur.get("lost_revenue"), prev.get("lost_revenue"),
                 lower_is_better=True, fmt=lambda v: _format_money_short(v, currency))
    _push_change(positives, "Health Score", cur.get("warehouse_health_score"), prev.get("warehouse_health_score"),
                 lower_is_better=False, fmt=lambda v: f"{round(v)}")
    _push_change(positives, "Замороженные остатки", cur.get("store_frozen_inventory_value"), prev.get("store_frozen_inventory_value"),
                 lower_is_better=True, fmt=lambda v: _format_money_short(v, currency))
    _push_change(positives, "Неликвид (SKU)", cur.get("dead_inventory_sku_count"), prev.get("dead_inventory_sku_count"),
                 lower_is_better=True, fmt=lambda v: str(int(v)))

    if positives:
        story.append(Paragraph("<b>Позитивные изменения</b>", body_style))
        for line in positives:
            story.append(Paragraph("✓ " + line, body_style))
        story.append(Spacer(1, 0.2*cm))

    if negatives:
        story.append(Paragraph("<b>Негативные изменения</b>", body_style))
        for line in negatives:
            story.append(Paragraph("✗ " + line, body_style))
        story.append(Spacer(1, 0.2*cm))

    if not positives and not negatives:
        story.append(Paragraph("Без значимых изменений по сравнению с предыдущим месяцем.", muted_style))

    # ─── 3. Деньги ─────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("3. Деньги", h2_style))

    top_lost = data.get("top_lost") or []
    if top_lost:
        story.append(Paragraph("<b>Потерянная выручка. ТОП-10 SKU</b>", body_style))
        rows = [["SKU", "Название", f"Потери ({currency})"]]
        total_lost = 0.0
        for r in top_lost:
            p = r.get("products") or {}
            if isinstance(p, list):
                p = p[0] if p else {}
            rows.append([
                p.get("sku") or "—",
                (p.get("product_name") or "—")[:50],
                _format_money(r.get("_lost"), currency),
            ])
            total_lost += r.get("_lost") or 0
        t = Table(rows, colWidths=[3.5*cm, 8*cm, 4.5*cm])
        t.setStyle(_top_table_style(font_name, font_bold))
        story.append(t)
        story.append(Paragraph(f"Всего потеряно: <b>{_format_money(total_lost, currency)}</b>", body_style))
        story.append(Spacer(1, 0.3*cm))
    else:
        story.append(Paragraph("Потерь по этой неделе не зафиксировано.", muted_style))

    top_frozen = data.get("top_frozen") or []
    if top_frozen:
        story.append(Paragraph("<b>Замороженные деньги. ТОП-10 SKU</b>", body_style))
        rows = [["SKU", "Название", f"Заморожено ({currency})"]]
        total_frozen = 0.0
        for r in top_frozen:
            p = r.get("products") or {}
            if isinstance(p, list):
                p = p[0] if p else {}
            rows.append([
                p.get("sku") or "—",
                (p.get("product_name") or "—")[:50],
                _format_money(r.get("_frozen"), currency),
            ])
            total_frozen += r.get("_frozen") or 0
        t = Table(rows, colWidths=[3.5*cm, 8*cm, 4.5*cm])
        t.setStyle(_top_table_style(font_name, font_bold))
        story.append(t)
        story.append(Paragraph(f"Всего заморожено: <b>{_format_money(total_frozen, currency)}</b>", body_style))

    # ─── 4. Динамика TVelo ─────────────────────────────
    growth = data.get("growth") or []
    decline = data.get("decline") or []
    if growth or decline:
        story.append(PageBreak())
        story.append(Paragraph("4. Динамика TVelo", h2_style))

    if growth:
        story.append(Paragraph("<b>ТОП роста спроса</b>", body_style))
        rows = [["SKU", "Название", "Скорость (пред. мес.)", "Скорость (тек. мес.)", "Δ%"]]
        for r in growth:
            p = r.get("products") or {}
            if isinstance(p, list):
                p = p[0] if p else {}
            rows.append([
                p.get("sku") or "—",
                (p.get("product_name") or "—")[:35],
                f"{float(r.get('median_30d_velocity') or 0):.2f}",
                f"{float(r.get('adjusted_velocity') or 0):.2f}",
                f"+{r.get('_delta_pct', 0):.0f}%",
            ])
        t = Table(rows, colWidths=[3*cm, 6*cm, 3*cm, 3*cm, 2*cm])
        t.setStyle(_top_table_style(font_name, font_bold))
        story.append(t)
        story.append(Spacer(1, 0.3*cm))

    if decline:
        story.append(Paragraph("<b>ТОП падения спроса</b>", body_style))
        rows = [["SKU", "Название", "Скорость (пред. мес.)", "Скорость (тек. мес.)", "Δ%"]]
        for r in decline:
            p = r.get("products") or {}
            if isinstance(p, list):
                p = p[0] if p else {}
            rows.append([
                p.get("sku") or "—",
                (p.get("product_name") or "—")[:35],
                f"{float(r.get('median_30d_velocity') or 0):.2f}",
                f"{float(r.get('adjusted_velocity') or 0):.2f}",
                f"{r.get('_delta_pct', 0):.0f}%",
            ])
        t = Table(rows, colWidths=[3*cm, 6*cm, 3*cm, 3*cm, 2*cm])
        t.setStyle(_top_table_style(font_name, font_bold))
        story.append(t)

    # ─── 5. Сегментация ────────────────────────────────
    segments = data.get("segments") or {}
    if segments:
        story.append(PageBreak())
        story.append(Paragraph("5. Сегментация склада", h2_style))
        rows = [["Сегмент", "SKU", f"Стоимость ({currency})"]]
        # Порядок сегментов
        seg_order = ["fast_movers", "stable", "slow_movers", "dead_inventory_risk", "insufficient_data"]
        for seg in seg_order:
            if seg not in segments:
                continue
            info = segments[seg]
            rows.append([
                SEGMENT_LABELS.get(seg, seg),
                str(int(info["count"])),
                _format_money(info["value"], currency),
            ])
        t = Table(rows, colWidths=[6*cm, 3*cm, 7*cm])
        t.setStyle(_top_table_style(font_name, font_bold))
        story.append(t)

    # ─── 6. Концентрация ───────────────────────────────
    story.append(Paragraph("6. Концентрация", h2_style))
    inv_conc = cur.get("inventory_concentration_50")
    dem_conc = cur.get("demand_concentration_50")
    story.append(Paragraph(
        f"<b>Остатки:</b> 50% всех денег лежит в <b>{inv_conc if inv_conc is not None else '—'}</b> SKU.",
        body_style,
    ))
    story.append(Paragraph(
        f"<b>Спрос:</b> 50% спроса дают <b>{dem_conc if dem_conc is not None else '—'}</b> SKU.",
        body_style,
    ))

    # ─── 7. Качество данных ────────────────────────────
    dq = data.get("data_quality") or {}
    story.append(Paragraph("7. Качество данных", h2_style))
    rows = [
        ["Средний confidence", f"{dq.get('avg_confidence'):.0f}%" if dq.get('avg_confidence') is not None else "—"],
        ["Пополнения склада", str(dq.get("replenishments") or 0)],
        ["Аномалии", str(dq.get("anomalies") or 0)],
        ["Пропуски данных", str(dq.get("missing_data") or 0)],
    ]
    t = Table(rows, colWidths=[8*cm, 8*cm])
    t.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), font_name, 10),
        ("FONT", (0, 0), (0, -1), font_bold, 10),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(t)

    # ─── Футер ─────────────────────────────────────────
    story.append(Spacer(1, 0.8*cm))
    story.append(Paragraph(
        f"Сформировано: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} · Veloseller",
        muted_style,
    ))

    doc.build(story)
    return buf.getvalue()


def _top_table_style(font_name: str, font_bold: str):
    from reportlab.lib import colors
    from reportlab.platypus import TableStyle
    return TableStyle([
        ("FONT", (0, 0), (-1, 0), font_bold, 9),
        ("FONT", (0, 1), (-1, -1), font_name, 9),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0f766e")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f0fdf4")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.HexColor("#0f766e")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ])


# ─── Идемпотентность ──────────────────────────────────────

def _already_sent_this_month(sb, seller_id: str, month_start: date) -> bool:
    """True, если месячный отчёт уже отправляли в ТЕКУЩЕМ календарном месяце.

    Идемпотентность в пределах прогона: kinds=['monthly_report'] + sent_date >=
    первого числа ТЕКУЩЕГО месяца (month_start = today.replace(day=1)). Раньше
    сюда передавали начало ОТЧЁТНОГО (прошлого) месяца, и проверка ловила
    прошломесячный отчёт → отчёт уходил через месяц. Фикс аудита 22.06.
    """
    try:
        res = (
            sb.table("report_history")
            .select("id")
            .eq("seller_id", seller_id)
            .contains("kinds", ["monthly_report"])
            .gte("sent_date", month_start.isoformat())
            .limit(1)
            .execute()
        )
        return bool(res.data)
    except Exception:
        logger.exception("monthly idempotency check failed seller=%s", seller_id)
        return False


def _record_monthly_history(
    sb, seller_id: str, status: str, period_start: date,
    filename: Optional[str], file_size: Optional[int],
    storage_path: Optional[str], error: Optional[str],
) -> None:
    try:
        sb.table("report_history").insert({
            "seller_id": seller_id,
            "day_of_week": period_start.isoweekday(),
            "kinds": ["monthly_report"],
            "channel": "email",
            "status": status,
            "sku_counts": {},
            "file_name": filename,
            "file_size_bytes": file_size,
            "storage_path": storage_path,
            "error_message": error,
        }).execute()
    except Exception:
        logger.exception("failed to insert monthly history seller=%s", seller_id)


# ─── Storage ──────────────────────────────────────────────

STORAGE_BUCKET = "report-files"
PDF_MIME = "application/pdf"


def _upload_pdf(sb, seller_id: str, today_str: str, filename: str, pdf_bytes: bytes) -> Optional[str]:
    path = f"{seller_id}/{today_str}/{filename}"
    try:
        sb.storage.from_(STORAGE_BUCKET).upload(
            path=path,
            file=pdf_bytes,
            file_options={"content-type": PDF_MIME, "upsert": "true"},
        )
        return path
    except Exception:
        logger.exception("pdf upload failed seller=%s path=%s", seller_id, path)
        return None


# ─── Главный диспетчер ────────────────────────────────────

def dispatch_monthly_reports() -> None:
    """Запускается scheduler'ом 1-го числа каждого месяца в 09:00 UTC.

    Шлёт PDF-отчёт за предыдущий месяц всем seller'ам которые имеют email
    и notify_email=true.
    """
    try:
        sb = get_supabase()
        today = datetime.now(timezone.utc).date()

        # Безопасность: если случайно вызвали не 1-го числа — лог и выход.
        # Тонкость: в проде scheduler'у можно задать day='1', но иногда хочется
        # ручной запуск (тест).
        if today.day != 1:
            logger.warning("dispatch_monthly_reports called on day=%d, expected day=1", today.day)

        prev_start, prev_end = _previous_month_period(today)
        period_label = _month_label(prev_start)
        two_back_start, two_back_end = _two_months_back(today)

        logger.info(
            "dispatch_monthly_reports start: period=%s..%s label=%s",
            prev_start, prev_end, period_label,
        )

        sellers_res = (
            sb.table("sellers")
            .select("id,email,display_name,currency,notify_email")
            .not_.is_("email", "null")
            .execute()
        )
        sellers = sellers_res.data or []

        sent = 0
        skipped = 0
        failed = 0

        for seller in sellers:
            seller_id = seller["id"]
            if not seller.get("notify_email", True):
                skipped += 1
                continue
            if not seller.get("email"):
                skipped += 1
                continue

            if _already_sent_this_month(sb, seller_id, today.replace(day=1)):
                logger.info("monthly already sent seller=%s", seller_id)
                skipped += 1
                continue

            currency = seller.get("currency") or "RUB"

            # Собираем данные
            current_metric = _fetch_store_metric_for_date(sb, seller_id, prev_end)
            # Якорь «позапрошлого» месяца — его КОНЕЦ (two_back_end), чтобы окно
            # сравнения было ровно перед прошлым месяцем, а не за месяц до него.
            previous_metric = _fetch_store_metric_for_date(sb, seller_id, two_back_end)

            if current_metric is None:
                logger.info("no current metric for seller=%s — skip", seller_id)
                _record_monthly_history(
                    sb, seller_id, "skipped", prev_start, None, None, None,
                    "no store_metrics for current month",
                )
                skipped += 1
                continue

            # SKU-метрики СТРОГО за отчётный (прошлый) месяц и за позапрошлый —
            # из снэпшотов через RPC, не из текущего tvelo_metrics. Так топ-листы,
            # сегменты и MoM-динамика относятся именно к месяцу отчёта.
            period_prev = _fetch_period_skus(sb, seller_id, prev_start, prev_end)
            period_two_back = _fetch_period_skus(sb, seller_id, two_back_start, two_back_end)
            growth, decline = _movers_from_periods(period_prev, period_two_back, limit=5)
            data = {
                "current_metric": current_metric,
                "previous_metric": previous_metric,
                "top_lost": _top_lost_from_period(period_prev, limit=10),
                "top_frozen": _top_frozen_from_period(period_prev, limit=10),
                "segments": _segments_from_period(period_prev),
                "data_quality": _fetch_data_quality(sb, seller_id, prev_start, prev_end),
                "growth": growth,
                "decline": decline,
            }

            # Строим PDF
            try:
                pdf_bytes = _build_pdf(
                    seller_name=seller.get("display_name") or seller["email"],
                    period_label=period_label,
                    data=data,
                    currency=currency,
                )
            except Exception:
                logger.exception("pdf build failed seller=%s", seller_id)
                _record_monthly_history(
                    sb, seller_id, "failed", prev_start, None, None, None, "pdf build error",
                )
                failed += 1
                continue

            today_str = today.isoformat()
            filename = f"veloseller-monthly-{prev_start.strftime('%Y-%m')}.pdf"
            storage_path = _upload_pdf(sb, seller_id, today_str, filename, pdf_bytes)

            try:
                from app.notifications import send_monthly_report_email
                success, send_err = send_monthly_report_email(
                    to_email=seller["email"],
                    seller_name=seller.get("display_name"),
                    pdf_bytes=pdf_bytes,
                    filename=filename,
                    period_label=period_label,
                )
            except Exception as e:
                logger.exception("send monthly email failed seller=%s", seller_id)
                success = False
                send_err = f"{type(e).__name__}: {str(e)[:180]}"

            if success:
                _record_monthly_history(
                    sb, seller_id, "sent", prev_start, filename,
                    len(pdf_bytes), storage_path, None,
                )
                sent += 1
            else:
                _record_monthly_history(
                    sb, seller_id, "failed", prev_start, filename,
                    len(pdf_bytes), storage_path, send_err or "send returned False",
                )
                failed += 1

        logger.info(
            "dispatch_monthly_reports done: sent=%d skipped=%d failed=%d",
            sent, skipped, failed,
        )

    except Exception:
        logger.exception("dispatch_monthly_reports crashed")
