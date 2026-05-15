"""Ozon Seller API. Docs: https://docs.ozon.ru/api/seller/"""
from __future__ import annotations
from datetime import datetime, timezone
from decimal import Decimal
import httpx
from app.schemas import SnapshotInput
from app.sources._http import with_retry

BASE = "https://api-seller.ozon.ru"


def _headers(client_id: str, api_key: str) -> dict[str, str]:
    return {"Client-Id": client_id, "Api-Key": api_key, "Content-Type": "application/json"}


def fetch_snapshots(client_id: str, api_key: str, page_size: int = 1000) -> list[SnapshotInput]:
    now = datetime.now(timezone.utc)
    out: list[SnapshotInput] = []

    with httpx.Client(timeout=60.0) as cli:
        # 1. Все product_id через пагинацию (с retry)
        product_ids: list[int] = []
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
            product_ids.extend(int(i["product_id"]) for i in items)
            last_id = data.get("last_id") or ""
            if not last_id or len(items) < page_size:
                break

        # 2. Stocks батчами по 100
        for i in range(0, len(product_ids), 100):
            batch = product_ids[i : i + 100]

            def _stocks_call(b=batch):
                resp = cli.post(
                    f"{BASE}/v4/product/info/stocks",
                    headers=_headers(client_id, api_key),
                    json={"product_id": [str(p) for p in b], "cursor": "", "limit": 100},
                )
                resp.raise_for_status()
                return resp.json()

            data = with_retry(_stocks_call)
            for item in data.get("items", []):
                sku = str(item.get("offer_id") or item.get("product_id") or "").strip()
                if not sku:
                    continue
                stocks = item.get("stocks", [])
                qty = sum(int(s.get("present", 0)) - int(s.get("reserved", 0)) for s in stocks)
                qty = max(0, qty)
                out.append(SnapshotInput(
                    sku=sku,
                    product_name=item.get("name") or None,
                    stock_quantity=qty,
                    price=Decimal("0"),
                    snapshot_time=now,
                ))

    return out
