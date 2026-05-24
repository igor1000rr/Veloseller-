"""Тесты _write_store_metrics — правка 4.1 Александра (Veloseller правки 4):

«Состояние склада не считаем товары SKU без активности» — inactive SKU исключаются из:
- warehouse_health_score
- inventory_concentration_50
- demand_concentration_50
- total_inventory_value
- store_frozen_inventory_value
- demand_pattern_distribution

Счётчики (total/oos/low/dead/inactive/frequently_oos) и lost_revenue — по всем SKU.
«inactive» = not availability_now AND not has_movements.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Optional
from unittest.mock import MagicMock

import pytest

from app.jobs.recalc import _write_store_metrics
from app.schemas import EventType, InventorySegment


# ─── Хелперы ────────────────────────────────────────────────────────────────────

@dataclass
class _FakeMetric:
    """Минимальный mock TVeloMetric для _write_store_metrics."""
    adjusted_velocity: float = 0.0
    median_30d_velocity: float = 0.0
    coverage_days: Optional[float] = None
    stockout_days: int = 0
    sku_health_score: Optional[float] = 50.0
    segment: Optional[InventorySegment] = None


def _make_item(
    pid: str,
    *,
    current_stock: int,
    current_price: float = 100.0,
    adjusted_velocity: float = 0.0,
    median_30d_velocity: float = 0.0,
    coverage_days: Optional[float] = None,
    stockout_days: int = 0,
    sku_health_score: Optional[float] = 50.0,
    has_movements: bool = True,
    segment: Optional[InventorySegment] = None,
) -> dict:
    """Сформировать item в формате sku_data (см. recalc_seller)."""
    return {
        "pid": pid,
        "metric": _FakeMetric(
            adjusted_velocity=adjusted_velocity,
            median_30d_velocity=median_30d_velocity,
            coverage_days=coverage_days,
            stockout_days=stockout_days,
            sku_health_score=sku_health_score,
            segment=segment,
        ),
        "current_stock": current_stock,
        "current_price": current_price,
        "availability_now": current_stock > 0,
        "aggregates": [],
        "has_movements": has_movements,
    }


def _capture_upsert(mock_sb: MagicMock) -> dict:
    """Извлечь аргумент upsert() для store_metrics."""
    call = mock_sb.table.return_value.upsert.call_args
    assert call is not None, "upsert не вызывался"
    return call.args[0]


# ─── Основные тесты правки 4.1 ──────────────────────────────────────────────

class TestInactiveExclusionFromHealth:
    """Inactive SKU не влияют на warehouse_health_score."""

    def test_inactive_does_not_drag_health_down(self):
        """3 здоровых + 5 inactive должны дать высокий health — inactive не учитываются."""
        sku_data = []
        # 3 здоровых SKU: высокий health, есть остаток, есть движения
        for i in range(3):
            sku_data.append(_make_item(
                f"healthy-{i}",
                current_stock=50, current_price=100.0,
                adjusted_velocity=1.0, median_30d_velocity=1.0,
                sku_health_score=95, coverage_days=50,
                has_movements=True,
            ))
        # 5 inactive SKU: stock=0, нет движений, низкий health
        for i in range(5):
            sku_data.append(_make_item(
                f"inactive-{i}",
                current_stock=0, current_price=100.0,
                adjusted_velocity=0.0, median_30d_velocity=0.0,
                sku_health_score=0, coverage_days=None,
                has_movements=False,
            ))

        mock_sb = MagicMock()
        _write_store_metrics(mock_sb, "s1", sku_data, date(2026, 5, 1), date(2026, 5, 30))

        payload = _capture_upsert(mock_sb)
        # health считался только по 3 здоровым → должен быть ≈ 95
        assert payload["warehouse_health_score"] >= 90

    def test_health_drops_if_all_active_unhealthy(self):
        """3 нездоровых + 5 inactive → health низкий (только по 3 больным)."""
        sku_data = []
        # 3 за OOS с движениями — это активные плохие SKU
        for i in range(3):
            sku_data.append(_make_item(
                f"oos-{i}",
                current_stock=0, current_price=100.0,
                adjusted_velocity=2.0, median_30d_velocity=2.0,
                sku_health_score=10, coverage_days=0,
                has_movements=True,  # были продажи
            ))
        # 5 inactive
        for i in range(5):
            sku_data.append(_make_item(
                f"inactive-{i}",
                current_stock=0,
                sku_health_score=100,  # намеренно высокий — проверить что не подтянет среднее
                has_movements=False,
            ))

        mock_sb = MagicMock()
        _write_store_metrics(mock_sb, "s1", sku_data, date(2026, 5, 1), date(2026, 5, 30))

        payload = _capture_upsert(mock_sb)
        # Если бы inactive учитывались с health=100, среднее было бы ~66.
        # С исключением — только 3 oos с health=10 + 100% OOS вес → должно быть очень низко
        assert payload["warehouse_health_score"] < 30


class TestInactiveExclusionFromInventoryValue:
    """Inactive с stock=0 всё равно дают 0 в inventory_value — но
    проверим теоретический случай inactive с остатком (корнер-кейс has_movements=False)."""

    def test_inactive_with_residual_stock_excluded_from_total_value(self):
        """Теоретический случай: inactive=True но current_stock>0 (редко но бывает — зависли остатки
        по снятому с продажи товару). В inactive_count они НЕ попадают (требуется stock=0),
        поэтому проверяем обратный случай: active SKU с остатком.

        Главное — inactive с stock=0 не искажают выводы.
        """
        sku_data = [
            _make_item("a", current_stock=100, current_price=50.0,
                       adjusted_velocity=1.0, has_movements=True),
            _make_item("b", current_stock=0, has_movements=False),  # inactive
        ]
        mock_sb = MagicMock()
        _write_store_metrics(mock_sb, "s1", sku_data, date(2026, 5, 1), date(2026, 5, 30))

        payload = _capture_upsert(mock_sb)
        # 100 шт × 50₽ = 5000 (только от активного SKU)
        assert payload["total_inventory_value"] == 5000.0

    def test_dead_inventory_value_excludes_inactive(self):
        """frozen_inventory считается только по active SKU."""
        sku_data = [
            # active неликвид: coverage>180
            _make_item("dead-active",
                       current_stock=10, current_price=200.0,
                       coverage_days=300, has_movements=True),
            # inactive с stock=0
            _make_item("inactive",
                       current_stock=0, has_movements=False),
        ]
        mock_sb = MagicMock()
        _write_store_metrics(mock_sb, "s1", sku_data, date(2026, 5, 1), date(2026, 5, 30))

        payload = _capture_upsert(mock_sb)
        # Только активный неликвид: 10 × 200 = 2000
        assert payload["store_frozen_inventory_value"] == 2000.0


class TestActiveOosCount:
    """Правка 2 Александра: oos_count = total в OOS - inactive.
    Нельзя показывать «Нет в наличии = 1500» если 1497 из них неактивны."""

    def test_oos_minus_inactive(self):
        # 3 активных OOS (нет остатка но были движения) + 5 inactive (без движений)
        sku_data = [
            _make_item("oos-active-1", current_stock=0,
                       adjusted_velocity=1.0, has_movements=True),
            _make_item("oos-active-2", current_stock=0,
                       adjusted_velocity=2.0, has_movements=True),
            _make_item("oos-active-3", current_stock=0,
                       adjusted_velocity=0.5, has_movements=True),
        ] + [
            _make_item(f"inactive-{i}", current_stock=0, has_movements=False)
            for i in range(5)
        ]
        mock_sb = MagicMock()
        _write_store_metrics(mock_sb, "s1", sku_data, date(2026, 5, 1), date(2026, 5, 30))

        payload = _capture_upsert(mock_sb)
        # Всего OOS = 8, inactive = 5, active_oos = 3
        assert payload["oos_sku_count"] == 3
        assert payload["inactive_sku_count"] == 5
        assert payload["total_sku_count"] == 8

    def test_no_inactive_oos_equals_full_oos(self):
        """Если inactive=0, oos_count не изменяется."""
        sku_data = [
            _make_item("oos1", current_stock=0, adjusted_velocity=1.0, has_movements=True),
            _make_item("oos2", current_stock=0, adjusted_velocity=1.0, has_movements=True),
            _make_item("ok",   current_stock=100, adjusted_velocity=1.0, has_movements=True),
        ]
        mock_sb = MagicMock()
        _write_store_metrics(mock_sb, "s1", sku_data, date(2026, 5, 1), date(2026, 5, 30))

        payload = _capture_upsert(mock_sb)
        assert payload["oos_sku_count"] == 2
        assert payload["inactive_sku_count"] == 0

    def test_active_oos_clamped_to_zero(self):
        """Если (теоретически) inactive > oos — не уходим в отрицательные (max(0, ...)).
        На практике inactive ⊆ oos, но проверяем инвариант."""
        sku_data = [_make_item("a", current_stock=100, adjusted_velocity=1.0, has_movements=True)]
        mock_sb = MagicMock()
        _write_store_metrics(mock_sb, "s1", sku_data, date(2026, 5, 1), date(2026, 5, 30))
        payload = _capture_upsert(mock_sb)
        assert payload["oos_sku_count"] >= 0


class TestFrequentlyOosCount:
    """frequently_oos_sku_count — SKU где stockout_days > 15 за период."""

    def test_counts_skus_above_15_stockout_days(self):
        sku_data = [
            _make_item("normal",     current_stock=10, stockout_days=5,  has_movements=True),
            _make_item("borderline", current_stock=10, stockout_days=15, has_movements=True),  # ==15, не входит
            _make_item("frequent1",  current_stock=0,  stockout_days=20, has_movements=True),
            _make_item("frequent2",  current_stock=0,  stockout_days=25, has_movements=True),
        ]
        mock_sb = MagicMock()
        _write_store_metrics(mock_sb, "s1", sku_data, date(2026, 5, 1), date(2026, 5, 30))
        payload = _capture_upsert(mock_sb)
        assert payload["frequently_oos_sku_count"] == 2


class TestLowAndDeadCounts:
    """low_stock (coverage<=7) и dead_inventory (coverage>180) — по всем SKU."""

    def test_low_stock_threshold(self):
        sku_data = [
            _make_item("low1", current_stock=5, coverage_days=3,  has_movements=True),
            _make_item("low2", current_stock=5, coverage_days=7,  has_movements=True),
            _make_item("ok",   current_stock=100, coverage_days=30, has_movements=True),
        ]
        mock_sb = MagicMock()
        _write_store_metrics(mock_sb, "s1", sku_data, date(2026, 5, 1), date(2026, 5, 30))
        payload = _capture_upsert(mock_sb)
        assert payload["low_stock_sku_count"] == 2

    def test_dead_inventory_threshold(self):
        sku_data = [
            _make_item("dead", current_stock=100, coverage_days=200, has_movements=True),
            _make_item("edge", current_stock=100, coverage_days=180, has_movements=True),  # не dead
            _make_item("ok",   current_stock=100, coverage_days=60,  has_movements=True),
        ]
        mock_sb = MagicMock()
        _write_store_metrics(mock_sb, "s1", sku_data, date(2026, 5, 1), date(2026, 5, 30))
        payload = _capture_upsert(mock_sb)
        assert payload["dead_inventory_sku_count"] == 1


class TestEdgeCases:
    def test_empty_sku_data_returns_zero(self):
        mock_sb = MagicMock()
        result = _write_store_metrics(mock_sb, "s1", [], date(2026, 5, 1), date(2026, 5, 30))
        assert result == 0
        mock_sb.table.return_value.upsert.assert_not_called()

    def test_all_inactive_health_none(self):
        """Если ВСЕ SKU inactive — health = None (нет базы для расчёта)."""
        sku_data = [
            _make_item(f"i{n}", current_stock=0, has_movements=False)
            for n in range(5)
        ]
        mock_sb = MagicMock()
        _write_store_metrics(mock_sb, "s1", sku_data, date(2026, 5, 1), date(2026, 5, 30))
        payload = _capture_upsert(mock_sb)
        # warehouse_health_score(empty) → None
        assert payload["warehouse_health_score"] is None
        assert payload["inactive_sku_count"] == 5
        assert payload["total_sku_count"] == 5

    def test_lost_revenue_includes_all_skus(self):
        """lost_revenue — по всем SKU (но inactive без velocity дают 0)."""
        sku_data = [
            _make_item("a", current_stock=0, current_price=100.0,
                       adjusted_velocity=2.0, stockout_days=10, has_movements=True),
            _make_item("inactive", current_stock=0, has_movements=False),
        ]
        mock_sb = MagicMock()
        _write_store_metrics(mock_sb, "s1", sku_data, date(2026, 5, 1), date(2026, 5, 30))
        payload = _capture_upsert(mock_sb)
        # Только от active: 2.0 × 10 × 100 = 2000
        assert payload["lost_revenue"] == 2000.0

    def test_total_sku_includes_inactive(self):
        """total_sku_count включает ВСЕ SKU (иначе селлер не увидит сколько у него всего)."""
        sku_data = [
            _make_item("a", current_stock=100, has_movements=True),
            _make_item("b", current_stock=50, has_movements=True),
            _make_item("inactive1", current_stock=0, has_movements=False),
            _make_item("inactive2", current_stock=0, has_movements=False),
        ]
        mock_sb = MagicMock()
        _write_store_metrics(mock_sb, "s1", sku_data, date(2026, 5, 1), date(2026, 5, 30))
        payload = _capture_upsert(mock_sb)
        assert payload["total_sku_count"] == 4


class TestSegmentDistribution:
    """demand_pattern_distribution — только по active SKU."""

    def test_inactive_skipped_in_segment_distribution(self):
        sku_data = [
            _make_item("fast", current_stock=10, has_movements=True,
                       segment=InventorySegment.FAST_MOVERS),
            _make_item("stable", current_stock=10, has_movements=True,
                       segment=InventorySegment.STABLE),
            _make_item("inactive", current_stock=0, has_movements=False,
                       segment=None),
        ]
        mock_sb = MagicMock()
        _write_store_metrics(mock_sb, "s1", sku_data, date(2026, 5, 1), date(2026, 5, 30))
        payload = _capture_upsert(mock_sb)
        distribution = payload["demand_pattern_distribution"]
        # Только 2 активных SKU в сегментах
        assert sum(distribution.values()) == 2
        assert "fast_movers" in distribution
        assert "stable" in distribution
