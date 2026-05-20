"""Тесты на _ensure_products и _persist_snapshots в main.py.

Покрываем БАГ 15 (батчинг .in_ при больших массивах SKU) и дедупликацию snapshot'ов.
"""
from __future__ import annotations
import os
os.environ["ENABLE_SCHEDULER"] = "false"

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from app.main import (
    _ensure_products, _persist_snapshots, _PRODUCTS_IN_BATCH,
    _cleanup_old_recalcs, _running_recalcs,
)
from app.schemas import SnapshotInput, SourceType


def _mk_snap(sku: str, stock: int = 10, price: float = 100.0) -> SnapshotInput:
    return SnapshotInput(sku=sku, stock_quantity=stock, price=Decimal(str(price)))


# ============================================================================
# БАГ 15: _ensure_products батчинг
# ============================================================================


class TestEnsureProductsBatching:
    """Батчинг .in_(sku, [...]) защищает от PostgREST URL лимита 8KB."""

    def test_small_batch_single_query(self):
        snaps = [_mk_snap(f"SKU{i}") for i in range(100)]
        mock_sb = MagicMock()
        mock_sb.table.return_value.upsert.return_value.execute.return_value = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.in_.return_value.execute.return_value = MagicMock(
            data=[{"product_id": f"pid-{i}", "sku": f"SKU{i}"} for i in range(100)]
        )

        result = _ensure_products(mock_sb, "seller-1", snaps)

        assert len(result) == 100
        assert result["SKU0"] == "pid-0"
        assert mock_sb.table.return_value.select.return_value.eq.return_value.in_.call_count == 1

    def test_large_array_split_into_batches(self):
        """При 1879 SKU должно быть 4 батча (500+500+500+379)."""
        snaps = [_mk_snap(f"SKU{i}") for i in range(1879)]
        mock_sb = MagicMock()
        mock_sb.table.return_value.upsert.return_value.execute.return_value = MagicMock()

        call_count = {"n": 0}

        def execute_side_effect():
            call_count["n"] += 1
            return MagicMock(data=[{"product_id": f"pid-{i}", "sku": f"SKU{i}"}
                                    for i in range((call_count["n"] - 1) * _PRODUCTS_IN_BATCH,
                                                   min(call_count["n"] * _PRODUCTS_IN_BATCH, 1879))])

        mock_sb.table.return_value.select.return_value.eq.return_value.in_.return_value.execute.side_effect = execute_side_effect

        result = _ensure_products(mock_sb, "seller-1", snaps)

        expected_batches = (1879 + _PRODUCTS_IN_BATCH - 1) // _PRODUCTS_IN_BATCH
        assert mock_sb.table.return_value.select.return_value.eq.return_value.in_.call_count == expected_batches
        assert len(result) == 1879

    def test_empty_snapshots(self):
        result = _ensure_products(MagicMock(), "seller-1", [])
        assert result == {}


# ============================================================================
# Дедупликация snapshot'ов
# ============================================================================


class TestPersistSnapshotsDedup:
    """Snapshot не записывается если stock+price совпадают с последним."""

    def _setup_mock(self, last_snap_data: list[dict]):
        mock_sb = MagicMock()
        mock_sb.table.return_value.upsert.return_value.execute.return_value = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.in_.return_value.execute.return_value = MagicMock(
            data=[{"product_id": "pid-A", "sku": "A1"}, {"product_id": "pid-B", "sku": "B2"}]
        )
        return mock_sb

    def test_duplicate_skipped(self, monkeypatch):
        mock_sb = self._setup_mock([])

        def fake_fetch_all(query):
            return [
                {"product_id": "pid-A", "stock_quantity": 10, "price": "100.00",
                 "snapshot_time": "2026-05-19T12:00:00Z"},
            ]

        monkeypatch.setattr("app.main.fetch_all", fake_fetch_all)
        monkeypatch.setattr("app.main.get_supabase", lambda: mock_sb)

        snaps = [_mk_snap("A1", stock=10, price=100.0)]
        result = _persist_snapshots("seller-1", "conn-1", SourceType.MARKETPLACE_API, snaps)

        assert result == 0
        mock_sb.table.return_value.insert.assert_not_called()

    def test_stock_changed_inserted(self, monkeypatch):
        mock_sb = self._setup_mock([])

        def fake_fetch_all(query):
            return [
                {"product_id": "pid-A", "stock_quantity": 10, "price": "100.00",
                 "snapshot_time": "2026-05-19T12:00:00Z"},
            ]

        monkeypatch.setattr("app.main.fetch_all", fake_fetch_all)
        monkeypatch.setattr("app.main.get_supabase", lambda: mock_sb)

        snaps = [_mk_snap("A1", stock=8, price=100.0)]
        result = _persist_snapshots("seller-1", "conn-1", SourceType.MARKETPLACE_API, snaps)

        assert result == 1
        mock_sb.table.return_value.insert.assert_called_once()

    def test_price_changed_inserted(self, monkeypatch):
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
        mock_sb = self._setup_mock([])

        monkeypatch.setattr("app.main.fetch_all", lambda q: [])
        monkeypatch.setattr("app.main.get_supabase", lambda: mock_sb)

        snaps = [_mk_snap("A1", stock=10, price=100.0)]
        result = _persist_snapshots("seller-1", "conn-1", SourceType.MARKETPLACE_API, snaps)

        assert result == 1
        mock_sb.table.return_value.insert.assert_called_once()

    def test_tiny_price_difference_treated_as_same(self, monkeypatch):
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

        assert result == 0

    def test_unmapped_skus_skipped_safely(self, monkeypatch):
        mock_sb = MagicMock()
        mock_sb.table.return_value.upsert.return_value.execute.return_value = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.in_.return_value.execute.return_value = MagicMock(
            data=[{"product_id": "pid-A", "sku": "A1"}]
        )
        monkeypatch.setattr("app.main.fetch_all", lambda q: [])
        monkeypatch.setattr("app.main.get_supabase", lambda: mock_sb)

        snaps = [_mk_snap("A1"), _mk_snap("B2")]
        result = _persist_snapshots("seller-1", "conn-1", SourceType.MARKETPLACE_API, snaps)

        assert result == 1


# ============================================================================
# БАГ 27: _cleanup_old_recalcs — TTL для finished tasks
# ============================================================================


class TestCleanupOldRecalcs:
    """Защита от memory leak — старые finished задачи удаляются."""

    def setup_method(self):
        """Очищаем перед каждым тестом."""
        _running_recalcs.clear()

    def teardown_method(self):
        _running_recalcs.clear()

    def test_keeps_running_tasks(self):
        """Running задачи никогда не удаляются, даже если давно начались."""
        old_time = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        _running_recalcs["seller-running"] = {
            "started_at": old_time,
            "status": "running",
            "finished_at": None,
        }
        _cleanup_old_recalcs()
        assert "seller-running" in _running_recalcs

    def test_keeps_recent_finished(self):
        """Finished задачи моложе 24ч остаются."""
        recent = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        _running_recalcs["seller-recent"] = {
            "status": "done",
            "finished_at": recent,
        }
        _cleanup_old_recalcs()
        assert "seller-recent" in _running_recalcs

    def test_removes_old_done(self):
        """Done задачи старше 24ч удаляются."""
        old = (datetime.now(timezone.utc) - timedelta(hours=25)).isoformat()
        _running_recalcs["seller-old-done"] = {
            "status": "done",
            "finished_at": old,
        }
        _cleanup_old_recalcs()
        assert "seller-old-done" not in _running_recalcs

    def test_removes_old_error(self):
        """Error задачи старше 24ч тоже удаляются."""
        old = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()
        _running_recalcs["seller-old-error"] = {
            "status": "error",
            "finished_at": old,
            "error": "something failed",
        }
        _cleanup_old_recalcs()
        assert "seller-old-error" not in _running_recalcs

    def test_handles_malformed_finished_at(self):
        """Поломанный timestamp — удаляем (нельзя оставлять навсегда)."""
        _running_recalcs["seller-broken"] = {
            "status": "done",
            "finished_at": "not-a-date",
        }
        _cleanup_old_recalcs()
        assert "seller-broken" not in _running_recalcs

    def test_handles_missing_finished_at(self):
        """Если finished_at отсутствует — не падаем, просто оставляем."""
        _running_recalcs["seller-no-finished"] = {
            "status": "done",
            # нет finished_at
        }
        # Не должен упасть
        _cleanup_old_recalcs()

    def test_mixed_cleanup(self):
        """Смешанные задачи — старые удалены, свежие остались."""
        old = (datetime.now(timezone.utc) - timedelta(hours=25)).isoformat()
        recent = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        _running_recalcs["old-1"] = {"status": "done", "finished_at": old}
        _running_recalcs["old-2"] = {"status": "error", "finished_at": old}
        _running_recalcs["recent"] = {"status": "done", "finished_at": recent}
        _running_recalcs["running"] = {"status": "running", "finished_at": None}

        _cleanup_old_recalcs()

        assert "old-1" not in _running_recalcs
        assert "old-2" not in _running_recalcs
        assert "recent" in _running_recalcs
        assert "running" in _running_recalcs
