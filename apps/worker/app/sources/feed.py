"""XML/RSS feed source. Простой парсер YML/Google Merchant feed формата.

Поддерживаемые форматы (auto-detect):
  - YML (Yandex Market): <offer id="SKU"><name/><price/><param name="stock">N</param></offer>
  - Google Merchant: <item><g:id/><g:title/><g:price/><g:availability/></item>
  - Simple custom: <product><sku/><name/><price/><stock/></product>
"""
from __future__ import annotations
from datetime import datetime, timezone
from decimal import Decimal
import re
import xml.etree.ElementTree as ET

import httpx

from app.schemas import SnapshotInput
from app.sources._http import with_retry


def fetch_snapshots(feed_url: str) -> list[SnapshotInput]:
    """Загружает feed по URL и парсит все три формата."""
    def _do():
        with httpx.Client(timeout=120.0, follow_redirects=True) as cli:
            r = cli.get(feed_url, headers={"User-Agent": "Veloseller-Bot/1.0"})
            r.raise_for_status()
            return r.text
    text = with_retry(_do)

    # Снимаем namespace для удобства
    text = re.sub(r'\sxmlns(:\w+)?="[^"]+"', "", text, count=0)
    root = ET.fromstring(text)
    now = datetime.now(timezone.utc)

    snapshots: list[SnapshotInput] = []

    # YML
    for offer in root.iter("offer"):
        sku = offer.get("id") or offer.findtext("vendorCode") or ""
        name = offer.findtext("name") or sku
        price_str = offer.findtext("price") or "0"
        stock = 0
        has_explicit_stock = False
        for param in offer.iter("param"):
            if (param.get("name") or "").lower() in ("stock", "остаток", "наличие"):
                stock = int(float((param.text or "0").strip()))
                has_explicit_stock = True
                break
        # Если stock не указан явно и available=true — fallback stock=1
        if not has_explicit_stock and offer.get("available") == "true":
            stock = 1
        if sku:
            snapshots.append(_make(sku, name, stock, price_str, now))

    if snapshots:
        return snapshots

    # Google Merchant
    for item in root.iter("item"):
        sku = item.findtext("id") or item.findtext("g:id") or ""
        name = item.findtext("title") or item.findtext("g:title") or sku
        price_str = (item.findtext("price") or item.findtext("g:price") or "0").split()[0]
        avail_str = (item.findtext("availability") or item.findtext("g:availability") or "").lower()
        stock = 1 if "in_stock" in avail_str else 0
        if sku:
            snapshots.append(_make(sku, name, stock, price_str, now))

    if snapshots:
        return snapshots

    # Simple custom
    for prod in root.iter("product"):
        sku = prod.findtext("sku") or prod.findtext("id") or ""
        name = prod.findtext("name") or prod.findtext("title") or sku
        price_str = prod.findtext("price") or "0"
        stock = int(float(prod.findtext("stock") or prod.findtext("quantity") or "0"))
        if sku:
            snapshots.append(_make(sku, name, stock, price_str, now))

    return snapshots


def _make(sku: str, name: str, stock: int, price_str: str, ts: datetime) -> SnapshotInput:
    price_str = re.sub(r"[^\d.,]", "", str(price_str)).replace(",", ".")
    try:
        price = Decimal(price_str) if price_str else Decimal("0")
    except Exception:
        price = Decimal("0")
    return SnapshotInput(
        sku=sku.strip(), product_name=name.strip() or None,
        stock_quantity=max(0, stock), price=price, snapshot_time=ts,
    )
