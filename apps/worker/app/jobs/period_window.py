"""Выбор 30-дневного окна метрик для отчётов.

tvelo_metrics и store_metrics пишутся по НЕСКОЛЬКИМ окнам (7/30/90 дней) на один
period_end (recalc_seller_all_periods — для графиков Динамики). Отчёты должны
брать ровно 30-дневное окно, иначе SKU дублируются, а сводные числа берутся из
случайного (last-inserted, обычно 90-дневного) окна. Здесь — общая логика.
"""
from __future__ import annotations

from datetime import date
from typing import Optional


def _closest_to_30d(period_end_iso: str, starts) -> Optional[str]:
    """Из доступных period_start возвращает тот, чьё окно ближе всего к 30 дням."""
    end_d = date.fromisoformat(period_end_iso[:10])
    valid = [s for s in starts if s]
    if not valid:
        return None
    return min(valid, key=lambda ps: abs((end_d - date.fromisoformat(ps[:10])).days - 30))


def latest_30d_window(sb, seller_id: str) -> tuple[Optional[str], Optional[str]]:
    """(period_start, period_end) 30-дневного окна ПОСЛЕДНЕГО периода в tvelo_metrics
    для селлера. (None, None) — если метрик нет."""
    try:
        res = (
            sb.table("tvelo_metrics")
            .select("period_start,period_end,products!inner(seller_id)")
            .eq("products.seller_id", seller_id)
            .order("period_end", desc=True)
            .limit(500)
            .execute()
        )
    except Exception:
        return None, None
    rows = res.data or []
    if not rows:
        return None, None
    latest_end = rows[0].get("period_end")
    if not latest_end:
        return None, None
    starts = {r["period_start"] for r in rows
              if r.get("period_end") == latest_end and r.get("period_start")}
    if not starts:
        return None, None
    return _closest_to_30d(latest_end, starts), latest_end


def store_metric_30d(sb, seller_id: str, target_date: date) -> Optional[dict]:
    """store_metrics 30-дневного окна последнего period_end ≤ target_date.
    store_metrics тоже пишется по окнам 7/30/90 — без выбора .limit(1) брал случайное."""
    try:
        res = (
            sb.table("store_metrics")
            .select("*")
            .eq("seller_id", seller_id)
            .lte("period_end", target_date.isoformat())
            .order("period_end", desc=True)
            .limit(30)  # хватает на несколько period_end × 3 окна
            .execute()
        )
    except Exception:
        return None
    rows = res.data or []
    if not rows:
        return None
    latest_end = rows[0].get("period_end")
    cands = [r for r in rows if r.get("period_end") == latest_end and r.get("period_start")]
    if not cands:
        return rows[0]
    end_d = date.fromisoformat(latest_end[:10])
    return min(cands, key=lambda r: abs((end_d - date.fromisoformat(r["period_start"][:10])).days - 30))
