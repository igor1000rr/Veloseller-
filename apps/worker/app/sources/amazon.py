"""Amazon Selling Partner API (SP-API) — СКЕЛЕТ В РАЗРАБОТКЕ.

Статус: не реализован. План:
  1. Регистрируем SP-API приложение в Seller Central → LWA app_id + client_secret.
  2. Подаём заявку на роли (Inventory + Sales, без PII) — ждём одобрения.
  3. OAuth: /api/oauth/amazon/start → редирект на Seller Central Auth
     → callback получает spapi_oauth_code → обмен на refresh_token (вечный)
     → храним {refresh_token, region, seller_id, marketplace_ids} в credentials.
  4. Access-token обмен каждые ~55 мин через api.amazon.com/auth/o2/token.
  5. Поллер: Reports API — 
       - GET_FBA_MYI_UNSUPPRESSED_INVENTORY_DATA — остатки
       - GET_FLAT_FILE_ALL_ORDERS_DATA_BY_LAST_UPDATE_GENERAL — продажи
     Асинхронные: createReport → polling getReport (status) → getReportDocument → парсим.
  6. Region routing: NA (https://sellingpartnerapi-na.amazon.com), EU, FE — выбор при подключении.
  7. Rate limits: жёсткие по burst+restore-rate — нужен backoff + token bucket.
Доки: https://developer-docs.amazon.com/sp-api/
"""
from __future__ import annotations
from typing import Literal
from app.schemas import SnapshotInput

Region = Literal["NA", "EU", "FE"]

REGION_ENDPOINTS = {
    "NA": "https://sellingpartnerapi-na.amazon.com",
    "EU": "https://sellingpartnerapi-eu.amazon.com",
    "FE": "https://sellingpartnerapi-fe.amazon.com",
}


class AmazonNotImplementedError(NotImplementedError):
    """Amazon SP-API connector в разработке."""


def fetch_snapshots(refresh_token: str, region: Region, seller_id: str) -> list[SnapshotInput]:
    """Снапшоты FBA inventory. Не реализовано."""
    raise AmazonNotImplementedError(
        "Amazon SP-API connector в разработке. Ожидается одобрение SP-API роли от Amazon."
    )


def fetch_sales(refresh_token: str, region: Region, seller_id: str, since_iso: str) -> list[dict]:
    """Продажи через Reports API (GET_FLAT_FILE_ALL_ORDERS_…). Не реализовано."""
    raise AmazonNotImplementedError(
        "Amazon SP-API sales connector в разработке."
    )
