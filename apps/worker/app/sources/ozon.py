"""Ozon Seller API. Docs: https://docs.ozon.ru/api/seller/

Получаем 3 сущности:
  1. /v3/product/list — все product_id (без stocks/цен)
  2. /v4/product/info/stocks — остатки (filter+cursor пагинация)
  3. /v5/product/info/prices — цены (тоже filter+cursor)

БАГ 18 fix: добавили MAX_PAGES защиту от бесконечной пагинации (если Ozon API
возвращает повторяющийся cursor с непустым items).

БАГ 20 fix: для prices ловим более широкий Exception — раньше httpx.HTTPStatusError
не покрывал timeout/network errors, sync падал на проблемах с prices API.
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import httpx
from app.schemas import SnapshotInput
from app.sources._http import with_retry

logger = logging.getLogger("veloseller.ozon")

BASE = "https://api-seller.ozon.ru"

# Защита от бесконечной пагинации. При 1000 items/page это >2M SKU — заведомо больше
# чем когда-либо у одного селлера. Если такое случится — что-то не так с API.
MAX_PAGES_PER_BATCH = 50


def _headers(client_id: str, api_key: str) -> dict[str, str]:
    return {"Client-Id": client_id, "Api-Key": api_key, "Content-Type": "application/json"}


def _decimal(v) -> Decimal:
    """Безопасное преобразование значения в Decimal с fallback на 0."""
    if v is None or v == "":
        return Decimal("0")
    try:
        return Decimal(str(v))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal("0")


def fetch_snapshots(client_id: str, api_key: str, page_size: int = 1000) -> list[SnapshotInput]:
    """Получить snapshots всех SKU продавца с остатками и ценами."""
    now = datetime.now(timezone.utc)

    with httpx.Client(timeout=60.0) as cli:
        # ====================================================================
        # 1. Все product_id через пагинацию /v3/product/list
        # ====================================================================
        product_ids: list[str] = []
        last_id = ""
        pages = 0
        while pages < MAX_PAGES_PER_BATCH:
            pages += 1

            def _list_call(lid=last_id):
                resp = cli.post(
                    f"{BASE}/v3/product/list",
                    headers=_headers(client_id, api_key),
                    json={"filter": {"visibility": "ALL"}, "last_id": lid, "limit": page_size},
                )
                resp.raise_for_status()
                return resp.json()

            data = with_retry(_list_call).get("result", {})
            items = data.get("items", [])
            if not items:
                break
            product_ids.extend(str(i["product_id"]) for i in items)
            new_last_id = data.get("last_id") or ""
            # Защита от зацикливания: если last_id не изменился, выходим
            if not new_last_id or new_last_id == last_id or len(items) < page_size:
                break
            last_id = new_last_id

        if pages >= MAX_PAGES_PER_BATCH:
            logger.warning("ozon /v3/product/list hit MAX_PAGES_PER_BATCH=%d", MAX_PAGES_PER_BATCH)

        if not product_ids:
            return []

        # ====================================================================
        # 2. Остатки через /v4/product/info/stocks
        # ====================================================================
        stocks_by_pid: dict[str, dict] = {}

        for i in range(0, len(product_ids), 1000):
            batch = product_ids[i : i + 1000]
            cursor = ""
            pages = 0
            while pages < MAX_PAGES_PER_BATCH:
                pages += 1

                def _stocks_call(b=batch, c=cursor):
                    resp = cli.post(
                        f"{BASE}/v4/product/info/stocks",
                        headers=_headers(client_id, api_key),
                        json={
                            "filter": {"product_id": b, "visibility": "ALL"},
                            "cursor": c,
                            "limit": 1000,
                        },
                    )
                    resp.raise_for_status()
                    return resp.json()

                data = with_retry(_stocks_call)
                items = data.get("items", [])
                for item in items:
                    pid = str(item.get("product_id") or "")
                    if not pid:
                        continue
                    stocks = item.get("stocks", [])
                    qty = sum(
                        int(s.get("present", 0)) - int(s.get("reserved", 0))
                        for s in stocks
                    )
                    qty = max(0, qty)
                    stocks_by_pid[pid] = {
                        "offer_id": str(item.get("offer_id") or pid),
                        "name": item.get("name"),
                        "qty": qty,
                    }
                new_cursor = data.get("cursor") or ""
                # Защита от зацикливания: cursor не должен повторяться
                if not new_cursor or new_cursor == cursor or not items:
                    break
                cursor = new_cursor

            if pages >= MAX_PAGES_PER_BATCH:
                logger.warning("ozon /v4/product/info/stocks hit MAX_PAGES_PER_BATCH=%d for batch %d", MAX_PAGES_PER_BATCH, i)

        # ====================================================================
        # 3. Цены через /v5/product/info/prices
        # ====================================================================
        prices_by_pid: dict[str, Decimal] = {}

        for i in range(0, len(product_ids), 1000):
            batch = product_ids[i : i + 1000]
            cursor = ""
            pages = 0
            while pages < MAX_PAGES_PER_BATCH:
                pages += 1

                def _prices_call(b=batch, c=cursor):
                    resp = cli.post(
                        f"{BASE}/v5/product/info/prices",
                        headers=_headers(client_id, api_key),
                        json={
                            "filter": {"product_id": b, "visibility": "ALL"},
                            "cursor": c,
                            "limit": 1000,
                        },
                    )
                    resp.raise_for_status()
                    return resp.json()

                try:
                    data = with_retry(_prices_call)
                except Exception as e:
                    # Цены не критичны для stock-based метрик; fallback на 0 для всех SKU в батче
                    logger.warning("ozon prices fetch failed for batch %d: %s", i, e)
                    data = {"items": [], "cursor": ""}
                items = data.get("items", [])
                for item in items:
                    pid = str(item.get("product_id") or "")
                    if not pid:
                        continue
                    price_info = item.get("price") or {}
                    raw = price_info.get("marketing_price") or price_info.get("price") or price_info.get("min_price") or "0"
                    prices_by_pid[pid] = _decimal(raw)
                new_cursor = data.get("cursor") or ""
                if not new_cursor or new_cursor == cursor or not items:
                    break
                cursor = new_cursor

        # ====================================================================
        # 4. Собираем SnapshotInput
        # ====================================================================
        out: list[SnapshotInput] = []
        for pid, s in stocks_by_pid.items():
            out.append(SnapshotInput(
                sku=s["offer_id"],  # человекочитаемый артикул, не product_id
                product_name=s["name"] or None,
                stock_quantity=s["qty"],
                price=prices_by_pid.get(pid, Decimal("0")),
                snapshot_time=now,
            ))

        logger.info("ozon fetch done: product_ids=%d, stocks=%d, prices=%d, snapshots=%d",
                    len(product_ids), len(stocks_by_pid), len(prices_by_pid), len(out))

    return out
