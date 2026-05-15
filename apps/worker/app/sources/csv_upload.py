"""CSV upload source.

Формат: колонки sku, product_name (опционально), stock_quantity, price.
"""
from __future__ import annotations
import csv
import io
from datetime import datetime, timezone
from decimal import Decimal
from typing import Iterable
from app.schemas import SnapshotInput


def parse_csv(content: bytes | str) -> list[SnapshotInput]:
    text = content.decode("utf-8") if isinstance(content, bytes) else content
    reader = csv.DictReader(io.StringIO(text))
    required = {"sku", "stock_quantity", "price"}
    if not required.issubset({h.strip().lower() for h in (reader.fieldnames or [])}):
        raise ValueError(f"CSV должен содержать колонки {required}")

    now = datetime.now(timezone.utc)
    out: list[SnapshotInput] = []
    for row in reader:
        norm = {k.strip().lower(): v for k, v in row.items() if k}
        out.append(SnapshotInput(
            sku=norm["sku"].strip(),
            product_name=(norm.get("product_name") or "").strip() or None,
            stock_quantity=int(float(norm["stock_quantity"])),
            price=Decimal(str(norm["price"]).replace(",", ".")),
            snapshot_time=now,
        ))
    return out
