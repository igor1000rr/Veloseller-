"""Витрина лендинга (правка 10, #8): месячный платформенный агрегат.

Раз в месяц считаем реальные цифры по всей базе и кладём в system_settings
под ключом 'landing_live_stats'. Лендинг (apps/web/app/_landing/Stats.tsx)
читает их оттуда через getSetting; пока ключа нет — показывает зашитый
fallback из data.ts. На .com блок скрыт (РФ-специфичные объёмы).

Источник цифр:
  • SKU под анализом       — count(products)
  • складов подключено     — count(data_connections)
  • потерянной выручки      — sum(lost_revenue) последней 30-дн store_metrics по продавцу
  • замороженных остатков   — sum(store_frozen_inventory_value) там же
Агрегат по ВСЕМ продавцам (включая тестовых). Если нужно исключить — добавить
фильтр по seller_id в _latest_store_metrics.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone

from app.db import fetch_all, get_supabase

logger = logging.getLogger("veloseller.landing_stats")

SETTING_KEY = "landing_live_stats"


def _fmt_int(n: int) -> str:
    """8970 -> '8 970' (пробел-разделитель тысяч, РФ-стиль)."""
    return f"{int(n):,}".replace(",", " ")


def _fmt_mln(rub: float) -> str:
    """Рубли -> строка в млн: '5,85' / '152' (РФ-десятичная запятая)."""
    mln = (rub or 0) / 1_000_000
    if mln >= 100:
        s = f"{round(mln)}"
    elif mln >= 10:
        s = f"{mln:.1f}".rstrip("0").rstrip(".")
    else:
        s = f"{mln:.2f}".rstrip("0").rstrip(".")
    return s.replace(".", ",")


def _plural_sklad(n: int) -> str:
    """Согласование 'склад' с числом: 1 склад, 2-4 склада, 5+ складов."""
    n = abs(int(n)) % 100
    if 11 <= n <= 14:
        return "складов"
    d = n % 10
    if d == 1:
        return "склад"
    if 2 <= d <= 4:
        return "склада"
    return "складов"


def _count(table: str, col: str) -> int:
    sb = get_supabase()
    res = sb.table(table).select(col, count="exact").limit(1).execute()
    return int(getattr(res, "count", None) or 0)


def _latest_store_metrics() -> dict[str, dict]:
    """Последняя 30-дн store_metrics по каждому продавцу (агрегат по его складам).

    Окно 30 дней — как дефолт дашборда. Берём свежайшую по computed_at; фетч
    ограничен последними 45 днями, чтобы не тянуть всю историю.
    """
    sb = get_supabase()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=45)).isoformat()
    rows = fetch_all(
        sb.table("store_metrics")
        .select("seller_id,lost_revenue,store_frozen_inventory_value,period_start,period_end,computed_at")
        .gte("computed_at", cutoff)
        .order("computed_at", desc=True)
    )
    latest: dict[str, dict] = {}
    for r in rows:
        try:
            days = (date.fromisoformat(str(r["period_end"])) - date.fromisoformat(str(r["period_start"]))).days
        except Exception:
            continue
        if not (28 <= days <= 31):
            continue
        sid = r.get("seller_id")
        if sid and sid not in latest:
            latest[sid] = r
    return latest


def compute_landing_stats() -> list[dict]:
    sku_count = _count("products", "product_id")
    wh_count = _count("data_connections", "id")

    latest = _latest_store_metrics()
    lost = sum(float(r.get("lost_revenue") or 0) for r in latest.values())
    frozen = sum(float(r.get("store_frozen_inventory_value") or 0) for r in latest.values())

    return [
        {"value": _fmt_int(sku_count), "unit": "", "label": "SKU под анализом"},
        {"value": _fmt_int(wh_count), "unit": "", "label": f"{_plural_sklad(wh_count)} подключено"},
        {"value": _fmt_mln(lost), "unit": "млн ₽", "label": "потерянной выручки найдено"},
        {"value": _fmt_mln(frozen), "unit": "млн ₽", "label": "замороженных остатков"},
    ]


def refresh_landing_stats() -> dict:
    """Пересчитать и записать витрину в system_settings (upsert по key)."""
    stats = compute_landing_stats()
    sb = get_supabase()
    sb.table("system_settings").upsert(
        {
            "key": SETTING_KEY,
            "value": stats,
            "category": "landing",
            "description": "Витрина лендинга: платформенный агрегат, обновляется раз в месяц джобом landing-stats",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="key",
    ).execute()
    logger.info("landing stats refreshed: %s", stats)
    return {"stats": stats}
