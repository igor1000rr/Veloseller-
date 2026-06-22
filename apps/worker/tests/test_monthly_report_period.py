"""Юнит-тесты на построители месячного отчёта за период (правка 22.06.2026):
top_lost / top_frozen / movers / segments теперь считаются строго за отчётный
месяц (из get_skus_period_metrics). Тестируем чистые билдеры на образцах метрик.
"""
from app.jobs.monthly_report import (
    _top_lost_from_period,
    _top_frozen_from_period,
    _movers_from_periods,
    _segments_from_period,
)


def _sku(sku, name, **kw):
    base = {
        "sku": sku, "product_name": name, "velocity": 0.0, "stockout_days": 0,
        "current_stock": 0, "current_price": 0.0, "coverage_days": None, "lost_revenue": 0.0,
    }
    base.update(kw)
    return base


def test_top_lost_sorted_and_filtered():
    skus = {
        "a": _sku("A", "Товар A", lost_revenue=500.0),
        "b": _sku("B", "Товар B", lost_revenue=1500.0),
        "c": _sku("C", "Товар C", lost_revenue=0.0),  # без потерь — отфильтрован
    }
    top = _top_lost_from_period(skus, limit=10)
    assert [r["products"]["sku"] for r in top] == ["B", "A"]
    assert top[0]["_lost"] == 1500.0


def test_top_frozen_coverage_filter():
    skus = {
        "a": _sku("A", "A", coverage_days=200.0, current_stock=10, current_price=100.0),  # frozen 1000
        "b": _sku("B", "B", coverage_days=50.0, current_stock=10, current_price=100.0),   # cov<180 — нет
        "c": _sku("C", "C", coverage_days=None, current_stock=10, current_price=100.0),   # None — нет
    }
    top = _top_frozen_from_period(skus, limit=10)
    assert [r["products"]["sku"] for r in top] == ["A"]
    assert top[0]["_frozen"] == 1000.0


def test_movers_mom_delta():
    now = {"a": _sku("A", "A", velocity=2.0), "b": _sku("B", "B", velocity=1.0)}
    prev = {"a": _sku("A", "A", velocity=1.0), "b": _sku("B", "B", velocity=2.0)}
    growth, decline = _movers_from_periods(now, prev, limit=5)
    # A: 1→2 = +100%, B: 2→1 = −50%
    assert growth[0]["products"]["sku"] == "A"
    assert round(growth[0]["_delta_pct"]) == 100
    assert decline[0]["products"]["sku"] == "B"
    assert round(decline[0]["_delta_pct"]) == -50


def test_movers_requires_both_positive():
    now = {"a": _sku("A", "A", velocity=2.0)}
    prev = {"a": _sku("A", "A", velocity=0.0)}  # 0 в прошлом месяце — пропускаем
    growth, decline = _movers_from_periods(now, prev, limit=5)
    assert growth == [] and decline == []


def test_segments_coverage_classification():
    skus = {
        "fast":   _sku("F", "F", coverage_days=10.0, current_stock=1, current_price=100.0),
        "stable": _sku("S", "S", coverage_days=40.0, current_stock=1, current_price=100.0),
        "slow":   _sku("L", "L", coverage_days=120.0, current_stock=1, current_price=100.0),
        "dead":   _sku("D", "D", coverage_days=300.0, current_stock=1, current_price=100.0),
        "insuf":  _sku("I", "I", coverage_days=None),
    }
    dist = _segments_from_period(skus)
    assert dist["fast_movers"]["count"] == 1
    assert dist["stable"]["count"] == 1
    assert dist["slow_movers"]["count"] == 1
    assert dist["dead_inventory_risk"]["count"] == 1
    assert dist["insufficient_data"]["count"] == 1
    assert dist["dead_inventory_risk"]["value"] == 100.0
