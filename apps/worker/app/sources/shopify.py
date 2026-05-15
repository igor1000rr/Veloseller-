"""Shopify Admin GraphQL API — СКЕЛЕТ В РАЗРАБОТКЕ.

Статус: не реализован. План:
  1. OAuth flow: /api/oauth/shopify/start → redirect на {shop}.myshopify.com/admin/oauth/authorize
     → callback /api/oauth/shopify/callback → обмен code на access_token
     → сохранить в data_connections.credentials_encrypted = {shop, access_token}
  2. Поллер: GraphQL Admin API —
       - inventoryLevels(first: 250) {…} — текущие остатки
       - orders(query: "created_at:>{since}", first: 250) {…} — продажи за период
     Обоих эндпоинтов хватит для snapshot и sales delta.
  3. Скоупы: read_products, read_inventory_items, read_orders.
  4. Пагинация через cursor (pageInfo.endCursor / hasNextPage).
Доки: https://shopify.dev/docs/api/admin-graphql
"""
from __future__ import annotations
from app.schemas import SnapshotInput


class ShopifyNotImplementedError(NotImplementedError):
    """Shopify connector в разработке."""


def fetch_snapshots(shop: str, access_token: str) -> list[SnapshotInput]:
    """Снапшоты остатков из Shopify. Не реализовано."""
    raise ShopifyNotImplementedError(
        "Shopify connector в разработке. Ожидаемый запуск — ближайший релиз."
    )


def fetch_sales(shop: str, access_token: str, since_iso: str) -> list[dict]:
    """Продажи из Shopify Orders API. Не реализовано."""
    raise ShopifyNotImplementedError(
        "Shopify sales connector в разработке."
    )
