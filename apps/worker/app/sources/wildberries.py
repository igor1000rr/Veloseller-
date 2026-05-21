"""Wildberries Statistics API + Content API.

Statistics API (statistics-api.wildberries.ru):
  - /api/v1/supplier/stocks — остатки и цены FBO. Rate-limit 1 req/60s.

Content API (content-api.wildberries.ru):
  - /content/v2/get/cards/list — карточки товаров с реальным name.
    Rate-limit: 100 req/min с тем же токеном.

БАГ 104 fix: раньше product_name заполнялся из поля subject (категория, например
"Кроссовки"), а не из реального названия карточки. Теперь тянем через Content API.
"""
from __future__ import annotations
import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import httpx
from app.schemas import SnapshotInput
from app.sources._http import with_retry

logger = logging.getLogger("veloseller.wb")

STOCKS_URL = "https://statistics-api.wildberries.ru/api/v1/supplier/stocks"
CARDS_URL = "https://content-api.wildberries.ru/content/v2/get/cards/list"

# Content API возвращает до 100 карточек за раз
CARDS_PAGE_SIZE = 100
# Защита от бесконечной пагинации (миллион карточек — заведомо больше реальности)
MAX_CARDS_PAGES = 1000


def _fetch_card_names(cli: httpx.Client, token: str) -> dict[str, str]:
    """Тащим все карточки продавца через Content API. Возвращает dict {vendorCode: title}.

    Использует cursor-пагинацию: updatedAt + nmID из последней карточки предыдущей страницы.
    Если Content API недоступен (токен без прав или endpoint упал) — возвращаем {},
    тогда _ensure_products сделает fallback product_name на SKU.
    """
    names: dict[str, str] = {}
    cursor_updated_at = None
    cursor_nm_id = None
    pages = 0

    while pages < MAX_CARDS_PAGES:
        pages += 1
        settings_cursor: dict = {"limit": CARDS_PAGE_SIZE}
        if cursor_updated_at and cursor_nm_id:
            settings_cursor["updatedAt"] = cursor_updated_at
            settings_cursor["nmID"] = cursor_nm_id

        payload = {
            "settings": {
                "cursor": settings_cursor,
                "filter": {"withPhoto": -1},  # -1 = все карточки (с фото и без)
            }
        }

        def _call(p=payload):
            resp = cli.post(CARDS_URL, headers={"Authorization": token}, json=p, timeout=60.0)
            resp.raise_for_status()
            return resp.json()

        try:
            data = with_retry(_call, base_delay=10.0, max_delay=60.0)
        except Exception as e:
            logger.warning("WB /content/v2/get/cards/list failed on page %d: %s", pages, e)
            break

        cards = data.get("cards") or []
        for card in cards:
            vendor_code = (card.get("vendorCode") or "").strip()
            title = (card.get("title") or "").strip()
            if vendor_code and title:
                names[vendor_code] = title

        # Cursor для следующей страницы: возвращается в data.cursor
        next_cursor = data.get("cursor") or {}
        total = int(next_cursor.get("total") or 0)
        if total < CARDS_PAGE_SIZE:
            # Меньше чем размер страницы — это последняя страница
            break

        new_updated_at = next_cursor.get("updatedAt")
        new_nm_id = next_cursor.get("nmID")
        if not new_updated_at or not new_nm_id:
            break
        # Защита от зацикливания
        if new_updated_at == cursor_updated_at and new_nm_id == cursor_nm_id:
            break
        cursor_updated_at = new_updated_at
        cursor_nm_id = new_nm_id

    if pages >= MAX_CARDS_PAGES:
        logger.warning("WB cards fetch hit MAX_CARDS_PAGES=%d", MAX_CARDS_PAGES)

    logger.info("WB cards fetched: %d", len(names))
    return names


def fetch_snapshots(token: str) -> list[SnapshotInput]:
    """Получить snapshots всех SKU продавца с остатками, ценами и реальными названиями."""
    now = datetime.now(timezone.utc)
    date_from = (now - timedelta(days=1)).isoformat(timespec="seconds")

    with httpx.Client(timeout=120.0) as cli:
        # 1. Остатки + цены через Statistics API
        def _stocks_call():
            resp = cli.get(STOCKS_URL, params={"dateFrom": date_from}, headers={"Authorization": token})
            resp.raise_for_status()
            return resp.json() or []

        # WB Statistics rate-limit 60s -> base_delay=60, max_delay=300
        rows = with_retry(_stocks_call, base_delay=60.0, max_delay=300.0)

        # 2. Реальные названия товаров через Content API (БАГ 104 fix)
        names_by_vendor = _fetch_card_names(cli, token)

    grouped: dict[str, dict] = defaultdict(lambda: {"qty": 0, "price": Decimal("0"), "subject": None})
    for r in rows:
        sku = (r.get("supplierArticle") or "").strip()
        if not sku:
            continue
        grouped[sku]["qty"] += int(r.get("quantityFull") or 0)
        price = r.get("Price") or 0
        if price and grouped[sku]["price"] == 0:
            grouped[sku]["price"] = Decimal(str(price))
        # subject — это категория ("Кроссовки"), используем как fallback если карточка
        # не подтянулась через Content API
        if not grouped[sku]["subject"]:
            grouped[sku]["subject"] = r.get("subject")

    snapshots = []
    name_found = 0
    name_from_subject = 0
    for sku, v in grouped.items():
        real_name = names_by_vendor.get(sku)
        if real_name:
            product_name = real_name
            name_found += 1
        elif v["subject"]:
            # Fallback на категорию — лучше чем артикул, хоть и не идеально
            product_name = v["subject"]
            name_from_subject += 1
        else:
            product_name = None  # _ensure_products поставит SKU
        snapshots.append(SnapshotInput(
            sku=sku,
            product_name=product_name,
            stock_quantity=max(0, v["qty"]),
            price=v["price"],
            snapshot_time=now,
        ))

    logger.info(
        "WB fetch done: stocks_rows=%d, snapshots=%d, names_from_cards=%d, names_from_subject=%d",
        len(rows), len(snapshots), name_found, name_from_subject,
    )
    return snapshots
