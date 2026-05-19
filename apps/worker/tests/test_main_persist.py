"""Тесты на _ensure_products и _persist_snapshots в main.py.

Покрываем БАГ 15 (батчинг .in_ при больших массивах SKU) и дедупликацию snapshot'ов.
"""
from __future__ import annotations
import os
os.environ["ENABLE_SCHEDULER"] = "false"

from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from app.main import _ensure_products, _persist_snapshots, _PRODUCTS_IN_BATCH
from app.schemas import SnapshotInput, SourceType


def _mk_snap(sku: str, stock: int = 10, price: float = 100.0) -> SnapshotInput:
    return SnapshotInput(sku=sku, stock_quantity=stock, price=Decimal(str(price)))


# ============================================================================
# БАГ 15: _ensure_products батчинг
# ============================================================================


class TestEnsureProductsBatching:
    """Батчинг .in_(sku, [...]) защищает от PostgREST URL лимита 8KB."""

    def test_small_batch_single_query(self):
        """При <500 SKU делает один запрос."""
        snaps = [_mk_snap(f"SKU{i}") for i in range(100)]
        mock_sb = MagicMock()
        # upsert
        mock_sb.table.return_value.upsert.return_value.execute.return_value = MagicMock()
        # select.eq.in_.execute → 100 строк
        mock_sb.table.return_value.select.return_value.eq.return_value.in_.return_value.execute.return_value = MagicMock(
            data=[{"product_id": f"pid-{i}", "sku": f"SKU{i}"} for i in range(100)]
        )

        result = _ensure_products(mock_sb, "seller-1", snaps)

        assert len(result) == 100
        assert result["SKU0"] == "pid-0"
        # Один in_ вызов (один батч)
        assert mock_sb.table.return_value.select.return_value.eq.return_value.in_.call_count == 1

    def test_large_array_split_into_batches(self):
        """При 1879 SKU должно быть 4 батча (500+500+500+379)."""
        snaps = [_mk_snap(f"SKU{i}") for i in range(1879)]
        mock_sb = MagicMock()
        mock_sb.table.return_value.upsert.return_value.execute.return_value = MagicMock()

        # Каждый вызов .in_ возвращает batch_size строк
        call_count = {"n": 0}

        def execute_side_effect():
            call_count["n"] += 1
            # Возвращаем фейковые продукты для всех SKU (грубое допущение для теста)
            return MagicMock(data=[{"product_id": f"pid-{i}", "sku": f"SKU{i}"}
                                    for i in range((call_count["n"] - 1) * _PRODUCTS_IN_BATCH,
                                                   min(call_count["n"] * _PRODUCTS_IN_BATCH, 1879))])

        mock_sb.table.return_value.select.return_value.eq.return_value.in_.return_value.execute.side_effect = execute_side_effect

        result = _ensure_products(mock_sb, "seller-1", snaps)

        # Должно быть 4 батча: ceil(1879 / 500) = 4
        expected_batches = (1879 + _PRODUCTS_IN_BATCH - 1) // _PRODUCTS_IN_BATCH
        assert mock_sb.table.return_value.select.return_value.eq.return_value.in_.call_count == expected_batches
        assert len(result) == 1879

    def test_empty_snapshots(self):
        """Пустой массив → пустой dict без запросов."""
        result = _ensure_products(MagicMock(), "seller-1", [])
        assert result == {}


# ============================================================================
# Дедупликация snapshot'ов
# ============================================================================


class TestPersistSnapshotsDedup:
    """Snapshot не записывается если stock+price совпадают с последним."""

    def _setup_mock(self, last_snap_data: list[dict]):
        """Helper: настраивает mock_sb для _persist_snapshots."""
        mock_sb = MagicMock()
        # _ensure_products:
        mock_sb.table.return_value.upsert.return_value.execute.return_value = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.in_.return_value.execute.return_value = MagicMock(
            data=[{"product_id": "pid-A", "sku": "A1"}, {"product_id": "pid-B", "sku": "B2"}]
        )
        return mock_sb

    def test_duplicate_skipped(self, monkeypatch):
        """Если stock и price такие же — snapshot не записывается."""
        mock_sb = self._setup_mock([])

        # fetch_all возвращает последний snapshot с stock=10, price=100
        def fake_fetch_all(query):
            return [
                {"product_id": "pid-A", "stock_quantity": 10, "price": "100.00",
                 "snapshot_time": "2026-05-19T12:00:00Z"},
            ]

        monkeypatch.setattr("app.main.fetch_all", fake_fetch_all)
        monkeypatch.setattr("app.main.get_supabase", lambda: mock_sb)

        # Передаём snapshot с такими же stock+price → должен быть пропущен
        snaps = [_mk_snap("A1", stock=10, price=100.0)]
        result = _persist_snapshots("seller-1", "conn-1", SourceType.MARKETPLACE_API, snaps)

        assert result == 0  # ничего не вставлено
        # insert не должен быть вызван (rows пустой)
        mock_sb.table.return_value.insert.assert_not_called()

    def test_stock_changed_inserted(self, monkeypatch):
        """Если stock изменился — snapshot записывается."""
        mock_sb = self._setup_mock([])

        def fake_fetch_all(query):
            return [
                {"product_id": "pid-A", "stock_quantity": 10, "price": "100.00",
                 "snapshot_time": "2026-05-19T12:00:00Z"},
            ]

        monkeypatch.setattr("app.main.fetch_all", fake_fetch_all)
        monkeypatch.setattr("app.main.get_supabase", lambda: mock_sb)

        # Stock изменился с 10 на 8
        snaps = [_mk_snap("A1", stock=8, price=100.0)]
        result = _persist_snapshots("seller-1", "conn-1", SourceType.MARKETPLACE_API, snaps)

        assert result == 1
        mock_sb.table.return_value.insert.assert_called_once()

    def test_price_changed_inserted(self, monkeypatch):
        """Если цена изменилась — snapshot записывается."""
        mock_sb = self._setup_mock([])

        def fake_fetch_all(query):
            return [
                {"product_id": "pid-A", "stock_quantity": 10, "price": "100.00",
                 "snapshot_time": "2026-05-19T12:00:00Z"},
            ]

        monkeypatch.setattr("app.main.fetch_all", fake_fetch_all)
        monkeypatch.setattr("app.main.get_supabase", lambda: mock_sb)

        snaps = [_mk_snap("A1", stock=10, price=120.0)]
        result = _persist_snapshots("seller-1", "conn-1", SourceType.MARKETPLACE_API, snaps)

        assert result == 1
        mock_sb.table.return_value.insert.assert_called_once()

    def test_no_previous_snapshot_inserted(self, monkeypatch):
        """Если для SKU нет предыдущего snapshot'а — записываем (первый раз)."""
        mock_sb = self._setup_mock([])

        # fetch_all возвращает пустой список — никаких предыдущих snapshot'ов
        monkeypatch.setattr("app.main.fetch_all", lambda q: [])
        monkeypatch.setattr("app.main.get_supabase", lambda: mock_sb)

        snaps = [_mk_snap("A1", stock=10, price=100.0)]
        result = _persist_snapshots("seller-1", "conn-1", SourceType.MARKETPLACE_API, snaps)

        assert result == 1
        mock_sb.table.return_value.insert.assert_called_once()

    def test_tiny_price_difference_treated_as_same(self, monkeypatch):
        """Разница в цене <0.01 считается отсутствием изменения (floating point)."""
        mock_sb = self._setup_mock([])

        def fake_fetch_all(query):
            return [
                {"product_id": "pid-A", "stock_quantity": 10, "price": "100.005",
                 "snapshot_time": "2026-05-19T12:00:00Z"},
            ]

        monkeypatch.setattr("app.main.fetch_all", fake_fetch_all)
        monkeypatch.setattr("app.main.get_supabase", lambda: mock_sb)

        snaps = [_mk_snap("A1", stock=10, price=100.008)]
        result = _persist_snapshots("seller-1", "conn-1", SourceType.MARKETPLACE_API, snaps)

        assert result == 0  # пропустили — разница 0.003 < 0.01

    def test_unmapped_skus_skipped_safely(self, monkeypatch):
        """Если SKU отсутствует в sku_to_pid (например, лимит URL) — пропускаем без падения."""
        mock_sb = MagicMock()
        mock_sb.table.return_value.upsert.return_value.execute.return_value = MagicMock()
        # _ensure_products возвращает маппинг только для A1, не для B2
        mock_sb.table.return_value.select.return_value.eq.return_value.in_.return_value.execute.return_value = MagicMock(
            data=[{"product_id": "pid-A", "sku": "A1"}]  # B2 отсутствует
        )
        monkeypatch.setattr("app.main.fetch_all", lambda q: [])
        monkeypatch.setattr("app.main.get_supabase", lambda: mock_sb)

        snaps = [_mk_snap("A1"), _mk_snap("B2")]
        result = _persist_snapshots("seller-1", "conn-1", SourceType.MARKETPLACE_API, snaps)

        # Только A1 записан
        assert result == 1
