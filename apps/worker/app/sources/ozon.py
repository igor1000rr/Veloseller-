"""Ozon Seller API. Docs: https://docs.ozon.ru/api/seller/

Получаем 3 сущности:
  1. /v3/product/list — все product_id (без stocks/цен)
  2. /v4/product/info/stocks — остатки (filter+cursor пагинация)
  3. /v5/product/info/prices — цены (тоже filter+cursor)
"""
from __future__ import annotations
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import httpx
from app.schemas import SnapshotInput
from app.sources._http import with_retry

BASE = "https://api-seller.ozon.ru"


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
        while True:
            def _list_call():
                resp = cli.post(
                    f"{BASE}/v3/product/list",
                    headers=_headers(client_id, api_key),
                    json={"filter": {"visibility": "ALL"}, "last_id": last_id, "limit": page_size},
                )
                resp.raise_for_status()
                return resp.json()

            data = with_retry(_list_call).get("result", {})
            items = data.get("items", [])
            if not items:
                break
            product_ids.extend(str(i["product_id"]) for i in items)
            last_id = data.get("last_id") or ""
            if not last_id or len(items) < page_size:
                break

        if not product_ids:
            return []

        # ====================================================================
        # 2. Остатки через /v4/product/info/stocks
        # ====================================================================
        # API ожидает body = { filter: { product_id: [...], visibility }, cursor, limit }
        stocks_by_pid: dict[str, dict] = {}  # product_id -> {offer_id, name, qty}

        for i in range(0, len(product_ids), 1000):
            batch = product_ids[i : i + 1000]
            cursor = ""

            while True:
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
                cursor = data.get("cursor") or ""
                if not cursor or not items:
                    break

        # ====================================================================
        # 3. Цены через /v5/product/info/prices
        # ====================================================================
        prices_by_pid: dict[str, Decimal] = {}

        for i in range(0, len(product_ids), 1000):
            batch = product_ids[i : i + 1000]
            cursor = ""

            while True:
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
                except httpx.HTTPStatusError:
                    # Цены не критичны для метрик stock-based; fallback на 0
                    data = {"items": [], "cursor": ""}
                items = data.get("items", [])
                for item in items:
                    pid = str(item.get("product_id") or "")
                    if not pid:
                        continue
                    price_info = item.get("price") or {}
                    # marketing_price > price > min_price
                    raw = price_info.get("marketing_price") or price_info.get("price") or price_info.get("min_price") or "0"
                    prices_by_pid[pid] = _decimal(raw)
                cursor = data.get("cursor") or ""
                if not cursor or not items:
                    break

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

    return out
