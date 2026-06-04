"""Shopify Admin GraphQL API — остатки и цены по SKU.

Модель Veloseller строится на дельтах суточных снапшотов остатков, поэтому
из Shopify нужен только текущий остаток + цена по каждому SKU (продажи движок
выводит сам из разницы остатков между снимками). Orders API не требуется.

Аутентификация — токен Admin API из custom app магазина (Settings → Apps → Develop
apps → Admin API access token). OAuth-флоу не нужен: токен постоянный, вводится
вручную как у Ozon/WB. Скоуп: read_products (включает inventoryQuantity на варианте).

Запрос — плоская коллекция productVariants (дёшево по cost-бюджету GraphQL,
≤1000 поинтов на запрос), курсорная пагинация. Один вариант = один SKU.
Docs: https://shopify.dev/docs/api/admin-graphql
"""
from __future__ import annotations
import logging
import os
import time
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import httpx
from app.schemas import SnapshotInput
from app.sources._http import with_retry

logger = logging.getLogger("veloseller.shopify")

# Версия Admin API. Shopify держит версию ~12 мес; бампать через env при сансете.
API_VERSION = os.environ.get("SHOPIFY_API_VERSION", "2025-10")

# productVariants(first: N): N*~2 поинта cost. 100 → ~200, безопасно (<1000).
PAGE_SIZE = 100
# Защита от бесконечной пагинации: 100 страниц * 100 = 10k вариантов.
MAX_PAGES = 100

_VARIANTS_QUERY = """
query($cursor: String, $n: Int!) {
  productVariants(first: $n, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      sku
      title
      price
      inventoryQuantity
      product { title }
    }
  }
}
""".strip()


def normalize_shop_domain(shop: str) -> str:
    """'mystore' / 'mystore.myshopify.com' / 'https://mystore.myshopify.com/' → 'mystore.myshopify.com'."""
    s = (shop or "").strip().lower()
    s = s.replace("https://", "").replace("http://", "").strip("/")
    s = s.split("/")[0]
    if not s:
        raise ValueError("Shopify: не указан домен магазина")
    if not s.endswith(".myshopify.com"):
        s = f"{s}.myshopify.com"
    return s


def _decimal(v) -> Decimal:
    """Безопасное преобразование в Decimal с fallback на 0."""
    if v is None or v == "":
        return Decimal("0")
    try:
        return Decimal(str(v))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal("0")


def fetch_snapshots(shop: str, access_token: str) -> list[SnapshotInput]:
    """Снапшоты остатков и цен по всем вариантам товаров магазина.

    Returns: list[SnapshotInput] (sku = variant.sku; варианты без sku пропускаются —
    sku нужен ключом products.sku в БД).
    """
    domain = normalize_shop_domain(shop)
    if not access_token or not access_token.strip():
        raise ValueError("Shopify: не указан access token")

    url = f"https://{domain}/admin/api/{API_VERSION}/graphql.json"
    headers = {
        "X-Shopify-Access-Token": access_token.strip(),
        "Content-Type": "application/json",
    }
    now = datetime.now(timezone.utc)

    out: list[SnapshotInput] = []
    seen_sku: set[str] = set()
    skipped_no_sku = 0
    cursor = None
    pages = 0

    with httpx.Client(timeout=60.0) as cli:
        while pages < MAX_PAGES:
            pages += 1

            def _call(c=cursor):
                resp = cli.post(url, headers=headers, json={
                    "query": _VARIANTS_QUERY,
                    "variables": {"cursor": c, "n": PAGE_SIZE},
                })
                if resp.status_code in (401, 403):
                    raise ValueError(
                        "Shopify: неверный access token или нет прав (нужен scope read_products)"
                    )
                resp.raise_for_status()
                return resp.json()

            data = with_retry(_call)

            if data.get("errors"):
                msg = "; ".join(str(e.get("message", e)) for e in data["errors"])[:300]
                raise ValueError(f"Shopify GraphQL error: {msg}")

            conn = ((data.get("data") or {}).get("productVariants") or {})
            nodes = conn.get("nodes") or []
            for v in nodes:
                sku = (v.get("sku") or "").strip()
                if not sku:
                    skipped_no_sku += 1
                    continue
                if sku in seen_sku:
                    # дубль sku между вариантами — берём первый (ключ products.sku один)
                    continue
                seen_sku.add(sku)
                product = v.get("product") or {}
                ptitle = (product.get("title") or "").strip()
                vtitle = (v.get("title") or "").strip()
                if vtitle and vtitle.lower() != "default title":
                    name = f"{ptitle} / {vtitle}" if ptitle else vtitle
                else:
                    name = ptitle or None
                qty_raw = v.get("inventoryQuantity")
                try:
                    qty = max(0, int(qty_raw)) if qty_raw is not None else 0
                except (TypeError, ValueError):
                    qty = 0
                out.append(SnapshotInput(
                    sku=sku,
                    product_name=name,
                    stock_quantity=qty,
                    price=_decimal(v.get("price")),
                    snapshot_time=now,
                ))

            page_info = conn.get("pageInfo") or {}
            if not page_info.get("hasNextPage"):
                break
            new_cursor = page_info.get("endCursor")
            if not new_cursor or new_cursor == cursor:
                break
            cursor = new_cursor
            time.sleep(0.3)  # вежливость к cost-бюджету GraphQL

        if pages >= MAX_PAGES:
            logger.warning("shopify productVariants hit MAX_PAGES=%d", MAX_PAGES)

    logger.info(
        "shopify fetch done: shop=%s, variants=%d, skipped_no_sku=%d, pages=%d",
        domain, len(out), skipped_no_sku, pages,
    )
    return out
