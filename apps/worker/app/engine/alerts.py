"""Alerts. Правила 10.1-10.5 + hysteresis для auto-resolve.

Hysteresis (БАГ 5 fix): алерт открывается при одном пороге, а закрывается при другом
(более либеральном). Это предотвращает «флаппинг» когда значение колеблется вокруг порога:
  - low_stock открывается при cov ≤ 7, закрывается только при cov > 10
  - critical_stock: open cov ≤ 3, close cov > 5
  - repeated_stockout: open > 3 дней, close ≤ 2
  - dead_inventory: open cov > 180, close cov ≤ 150
"""
from __future__ import annotations
from typing import Optional


# ===== Open thresholds (когда создавать новый алерт) =====

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


# ===== Close thresholds (когда можно auto-resolve существующий) =====
#
# Идея: если alert уже активен, держим его открытым пока значение «не ушло» достаточно далеко
# за порог. Разрыв между open/close предотвращает флаппинг при колебаниях около границы.

def should_keep_low_stock_active(coverage_days: Optional[float]) -> bool:
    """low_stock alert держится открытым пока cov ≤ 10 (open: ≤7, close: >10)."""
    if coverage_days is None:
        return False
    return coverage_days <= 10


def should_keep_critical_active(coverage_days: Optional[float]) -> bool:
    """critical держится пока cov ≤ 5 (open: ≤3, close: >5)."""
    if coverage_days is None:
        return False
    return coverage_days <= 5


def should_keep_dead_active(coverage_days: Optional[float]) -> bool:
    """dead держится пока cov > 150 (open: >180, close: ≤150)."""
    if coverage_days is None:
        return False
    return coverage_days > 150


def should_keep_repeated_stockout_active(stockout_days: int) -> bool:
    """repeated_stockout держится пока stockout > 2 (open: >3, close: ≤2)."""
    return stockout_days > 2
