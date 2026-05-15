"""Wildberries Statistics API. Rate-limit 1 req/60s — используем with_retry с большим delay."""
from __future__ import annotations
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import httpx
from app.schemas import SnapshotInput
from app.sources._http import with_retry

URL = "https://statistics-api.wildberries.ru/api/v1/supplier/stocks"


def fetch_snapshots(token: str) -> list[SnapshotInput]:
    now = datetime.now(timezone.utc)
    date_from = (now - timedelta(days=1)).isoformat(timespec="seconds")

    with httpx.Client(timeout=120.0) as cli:
        def _call():
            resp = cli.get(URL, params={"dateFrom": date_from}, headers={"Authorization": token})
            resp.raise_for_status()
            return resp.json() or []

        # WB rate-limit 60s -> base_delay=60, max_delay=300
        rows = with_retry(_call, base_delay=60.0, max_delay=300.0)

    grouped: dict[str, dict] = defaultdict(lambda: {"qty": 0, "price": Decimal("0"), "name": None})
    for r in rows:
        sku = (r.get("supplierArticle") or "").strip()
        if not sku:
            continue
        grouped[sku]["qty"] += int(r.get("quantityFull") or 0)
        price = r.get("Price") or 0
        if price and grouped[sku]["price"] == 0:
            grouped[sku]["price"] = Decimal(str(price))
        if not grouped[sku]["name"]:
            grouped[sku]["name"] = r.get("subject")

    return [
        SnapshotInput(
            sku=sku,
            product_name=v["name"],
            stock_quantity=max(0, v["qty"]),
            price=v["price"],
            snapshot_time=now,
        )
        for sku, v in grouped.items()
    ]
