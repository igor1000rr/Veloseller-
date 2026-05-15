"""Alerts. Правила 10.1-10.5."""
from __future__ import annotations
from typing import Optional


def low_stock_alert(coverage_days: Optional[float]) -> bool:
    if coverage_days is None:
        return False
    return coverage_days <= 7


def critical_stock_alert(coverage_days: Optional[float]) -> bool:
    if coverage_days is None:
        return False
    return coverage_days <= 3


def dead_inventory_alert(coverage_days: Optional[float]) -> bool:
    if coverage_days is None:
        return False
    return coverage_days > 180


def repeated_stockout_alert(stockout_days: int) -> bool:
    return stockout_days > 3
