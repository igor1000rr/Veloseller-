"""Pydantic-модели и enum-ы (синхронизировано с supabase/migrations/0001_init.sql)."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class EventType(str, Enum):
    FIRST_SNAPSHOT = "first_snapshot"
    NO_CHANGE = "no_change"
    SALES_LIKE = "sales_like"
    REPLENISHMENT_LIKE = "replenishment_like"
    ANOMALY_LIKE = "anomaly_like"
    MISSING_DATA = "missing_data"
    RECOUNT_LIKE = "recount_like"


class SourceType(str, Enum):
    GOOGLE_SHEET = "google_sheet"
    MARKETPLACE_API = "marketplace_api"
    CSV_UPLOAD = "csv_upload"
    FEED = "feed"
    MANUAL = "manual"


class InventorySegment(str, Enum):
    FAST_MOVERS = "fast_movers"
    STABLE = "stable"
    SLOW_MOVERS = "slow_movers"
    DEAD_INVENTORY_RISK = "dead_inventory_risk"
    INSUFFICIENT_DATA = "insufficient_data"


class SnapshotInput(BaseModel):
    sku: str
    product_name: Optional[str] = None
    stock_quantity: int = Field(ge=0)
    price: Decimal = Field(ge=0)
    snapshot_time: Optional[datetime] = None
    # Доп. поля (правки 10): цена продавца / факт. цена со скидками (#3),
    # комиссия маркетплейса в % (#5), бренд и категория для тегов (#6).
    # Все опциональны — источник заполняет что может, остальное пишется как null.
    seller_price: Optional[Decimal] = None
    marketing_price: Optional[Decimal] = None
    commission_pct: Optional[Decimal] = None
    brand: Optional[str] = None
    category: Optional[str] = None


class IngestPayload(BaseModel):
    seller_id: UUID
    source_id: Optional[UUID] = None
    source_type: SourceType
    snapshots: list[SnapshotInput]


class ConfidenceBreakdown(BaseModel):
    initial: float
    replenishment_like: float
    anomaly_like: float
    missing_data: float
    # Штраф за малую историю: если < 7 дней sales_like — выборка непредставительна.
    # Optional для бэк-компатибильности со старыми JSON-записями в бд.
    low_history: float = 0.0
    final: float


class HealthBreakdown(BaseModel):
    stockout: float
    low_coverage: float
    dead_inventory: float
    confidence: float
    final: int


class TVeloMetric(BaseModel):
    product_id: UUID
    period_start: date
    period_end: date
    confirmed_velocity: float
    adjusted_velocity: float
    # БАГ 9 fix: настоящая медиана из 30-day pre-period (Rule 5.2). Раньше в
    # store-level demand_weight подставлялся adjusted_velocity как proxy, что
    # занижало demand для SKU с adj=0 но историей продаж (dead inventory с историей).
    # Optional для бэк-совместимости со старыми кодом и записями.
    median_30d_velocity: float = 0.0
    confidence_score: float
    confidence_breakdown: Optional[ConfidenceBreakdown] = None
    stockout_days: int
    in_stock_days: int
    coverage_days: Optional[float]
    current_stock: int
    sku_health_score: Optional[int] = None
    health_breakdown: Optional[HealthBreakdown] = None
    segment: Optional[InventorySegment] = None
