"""Pydantic-схемы: входные snapshots, промежуточные метрики."""
from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class EventType(str, Enum):
    FIRST_SNAPSHOT = "first_snapshot"
    NO_CHANGE = "no_change"
    SALES_LIKE = "sales_like"
    REPLENISHMENT_LIKE = "replenishment_like"
    ANOMALY_LIKE = "anomaly_like"
    RECOUNT_LIKE = "recount_like"
    MISSING_DATA = "missing_data"


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
    snapshot_time: datetime


class IngestPayload(BaseModel):
    seller_id: str
    connection_id: Optional[str] = None
    source: SourceType
    snapshots: list[SnapshotInput]


class ConfidenceBreakdown(BaseModel):
    initial: float
    replenishment_like: float
    anomaly_like: float
    missing_data: float
    final: float


class HealthBreakdown(BaseModel):
    stockout: float
    low_coverage: float
    dead_inventory: float
    confidence: float
    final: int


class TVeloMetric(BaseModel):
    product_id: str
    period_start: date
    period_end: date
    confirmed_velocity: float
    adjusted_velocity: float
    confidence_score: float
    confidence_breakdown: Optional[ConfidenceBreakdown] = None
    stockout_days: int
    in_stock_days: int
    coverage_days: Optional[float]
    current_stock: int
    sku_health_score: Optional[int] = None
    health_breakdown: Optional[HealthBreakdown] = None
    segment: Optional[InventorySegment] = None
