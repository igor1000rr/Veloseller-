"""Тесты на _ensure_products и _persist_snapshots в main.py.

Покрываем БАГ 15 (батчинг .in_ при больших массивах SKU) и дедупликацию snapshot'ов.

После миграции products_scoped_to_connection (май 2026) _ensure_products
принимает connection_id обязательным параметром, а SELECT для маппинга
sku→product_id делает .eq('seller_id').eq('connection_id').in_('sku').

Рефакторинг _running_recalcs → recalc_jobs BD: TestCleanupOldRecalcs удалён
(функция _cleanup_old_recalcs больше не существует — состояние хранится в БД
по PK seller_id, in-memory TTL не нужен).
"""
from __future__ import annotations
import os
os.environ["ENABLE_SCHEDULER"] = "false"

from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from app.main import _ensure_products, _persist_snapshots, _PRODUCTS_IN_BATCH
from app.schemas import SnapshotInput, SourceType


CONN_ID = "conn-test-1"


def _mk_snap(sku: str, stock: int = 10, price: float = 100.0) -> SnapshotInput:
    return SnapshotInput(sku=sku, stock_quantity=stock, price=Decimal(str(price)))


def _setup_mock_for_select(mock_sb, products_data):
    """Настраивает мок для select(...).eq().eq().in_().execute() chain."""
    chain = mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.in_.return_value
    chain.execute.return_value = MagicMock(data=products_data)
    return chain


# ============================================================================
# БАГ 15: _ensure_products батчинг
# ============================================================================


class TestEnsureProductsBatching:
    """Батчинг .in_(sku, [...]) защищает от PostgREST URL лимита 8KB."""

    def test_small_batch_single_query(self):
        snaps = [_mk_snap(f"SKU{i}") for i in range(100)]
        mock_sb = MagicMock()
        mock_sb.table.return_value.upsert.return_value.execute.return_value = MagicMock()
        chain = _setup_mock_for_select(mock_sb,
            [{"product_id": f"pid-{i}", "sku": f"SKU{i}"} for i in range(100)]
        )

        result = _ensure_products(mock_sb, "seller-1", CONN_ID, snaps)

        assert len(result) == 100
        assert result["SKU0"] == "pid-0"
        # Один SELECT-вызов на 100 SKU (меньше batch=500)
        in_mock = mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.in_
        assert in_mock.call_count == 1

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

        chain = mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.in_.return_value
        chain.execute.side_effect = execute_side_effect

        result = _ensure_products(mock_sb, "seller-1", CONN_ID, snaps)

        expected_batches = (1879 + _PRODUCTS_IN_BATCH - 1) // _PRODUCTS_IN_BATCH
        in_mock = mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.in_
        assert in_mock.call_count == expected_batches
        assert len(result) == 1879

    def test_empty_snapshots(self):
        result = _ensure_products(MagicMock(), "seller-1", CONN_ID, [])
        assert result == {}

    def test_missing_connection_id_raises(self):
        """После миграции products.connection_id NOT NULL — без него ValueError."""
        snaps = [_mk_snap("A1")]
        with pytest.raises(ValueError, match="connection_id"):
            _ensure_products(MagicMock(), "seller-1", None, snaps)

    def test_upsert_includes_connection_id(self):
        """REGRESSION: products upsert (через RPC bulk_upsert_products) включает connection_id в каждой строке."""
        snaps = [_mk_snap("X1"), _mk_snap("X2")]
        mock_sb = MagicMock()
        rpc_payloads = []
        mock_sb.rpc.side_effect = lambda fn, params=None: (
            rpc_payloads.append((fn, params))
            or MagicMock(execute=MagicMock(return_value=MagicMock()))
        )
        _setup_mock_for_select(mock_sb, [
            {"product_id": "pid-X1", "sku": "X1"},
            {"product_id": "pid-X2", "sku": "X2"},
        ])

        _ensure_products(mock_sb, "seller-1", CONN_ID, snaps)

        assert len(rpc_payloads) == 1
        fn, params = rpc_payloads[0]
        assert fn == "bulk_upsert_products"
        rows = params["p_rows"]
        # Каждая строка имеет connection_id
        for row in rows:
            assert row["connection_id"] == CONN_ID
            assert row["seller_id"] == "seller-1"
            assert row["sku"] in {"X1", "X2"}


# ============================================================================
# Дедупликация snapshot'ов
# ============================================================================


class TestPersistSnapshotsDedup:
    """Snapshot не записывается если stock+price совпадают с последним."""

    def _setup_mock(self):
        mock_sb = MagicMock()
        mock_sb.table.return_value.upsert.return_value.execute.return_value = MagicMock()
        _setup_mock_for_select(mock_sb, [
            {"product_id": "pid-A", "sku": "A1"},
            {"product_id": "pid-B", "sku": "B2"},
        ])
        return mock_sb

    def test_duplicate_skipped(self, monkeypatch):
        mock_sb = self._setup_mock()

        def fake_fetch_all(query):
            return [
                {"product_id": "pid-A", "stock_quantity": 10, "price": "100.00",
                 "snapshot_time": "2026-05-19T12:00:00Z"},
            ]

        monkeypatch.setattr("app.main.fetch_all", fake_fetch_all)
        monkeypatch.setattr("app.main.get_supabase", lambda: mock_sb)

        snaps = [_mk_snap("A1", stock=10, price=100.0)]
        result = _persist_snapshots("seller-1", CONN_ID, SourceType.MARKETPLACE_API, snaps)

        assert result == 0
        mock_sb.table.return_value.insert.assert_not_called()

    def test_stock_changed_inserted(self, monkeypatch):
        mock_sb = self._setup_mock()

        def fake_fetch_all(query):
            return [
                {"product_id": "pid-A", "stock_quantity": 10, "price": "100.00",
                 "snapshot_time": "2026-05-19T12:00:00Z"},
            ]

        monkeypatch.setattr("app.main.fetch_all", fake_fetch_all)
        monkeypatch.setattr("app.main.get_supabase", lambda: mock_sb)

        snaps = [_mk_snap("A1", stock=8, price=100.0)]
        result = _persist_snapshots("seller-1", CONN_ID, SourceType.MARKETPLACE_API, snaps)

        assert result == 1
        mock_sb.table.return_value.insert.assert_called_once()

    def test_price_changed_inserted(self, monkeypatch):
        mock_sb = self._setup_mock()

        def fake_fetch_all(query):
            return [
                {"product_id": "pid-A", "stock_quantity": 10, "price": "100.00",
                 "snapshot_time": "2026-05-19T12:00:00Z"},
            ]

        monkeypatch.setattr("app.main.fetch_all", fake_fetch_all)
        monkeypatch.setattr("app.main.get_supabase", lambda: mock_sb)

        snaps = [_mk_snap("A1", stock=10, price=120.0)]
        result = _persist_snapshots("seller-1", CONN_ID, SourceType.MARKETPLACE_API, snaps)

        assert result == 1
        mock_sb.table.return_value.insert.assert_called_once()

    def test_no_previous_snapshot_inserted(self, monkeypatch):
        mock_sb = self._setup_mock()

        monkeypatch.setattr("app.main.fetch_all", lambda q: [])
        monkeypatch.setattr("app.main.get_supabase", lambda: mock_sb)

        snaps = [_mk_snap("A1", stock=10, price=100.0)]
        result = _persist_snapshots("seller-1", CONN_ID, SourceType.MARKETPLACE_API, snaps)

        assert result == 1
        mock_sb.table.return_value.insert.assert_called_once()

    def test_tiny_price_difference_treated_as_same(self, monkeypatch):
        mock_sb = self._setup_mock()

        def fake_fetch_all(query):
            return [
                {"product_id": "pid-A", "stock_quantity": 10, "price": "100.005",
                 "snapshot_time": "2026-05-19T12:00:00Z"},
            ]

        monkeypatch.setattr("app.main.fetch_all", fake_fetch_all)
        monkeypatch.setattr("app.main.get_supabase", lambda: mock_sb)

        snaps = [_mk_snap("A1", stock=10, price=100.008)]
        result = _persist_snapshots("seller-1", CONN_ID, SourceType.MARKETPLACE_API, snaps)

        assert result == 0

    def test_unmapped_skus_skipped_safely(self, monkeypatch):
        mock_sb = MagicMock()
        mock_sb.table.return_value.upsert.return_value.execute.return_value = MagicMock()
        _setup_mock_for_select(mock_sb, [{"product_id": "pid-A", "sku": "A1"}])
        monkeypatch.setattr("app.main.fetch_all", lambda q: [])
        monkeypatch.setattr("app.main.get_supabase", lambda: mock_sb)

        snaps = [_mk_snap("A1"), _mk_snap("B2")]
        result = _persist_snapshots("seller-1", CONN_ID, SourceType.MARKETPLACE_API, snaps)

        assert result == 1

    def test_persist_without_connection_id_returns_zero(self, monkeypatch):
        """_persist_snapshots с connection_id=None — log warning + return 0."""
        snaps = [_mk_snap("A1")]
        result = _persist_snapshots("seller-1", None, SourceType.CSV_UPLOAD, snaps)
        assert result == 0


class TestPersistSnapshotsPriceCarryForward:
    """price=None (частичный сбой фетча цен): перенос последней цены вместо 0."""

    def _setup_mock(self):
        mock_sb = MagicMock()
        mock_sb.table.return_value.upsert.return_value.execute.return_value = MagicMock()
        _setup_mock_for_select(mock_sb, [{"product_id": "pid-A", "sku": "A1"}])
        return mock_sb

    def test_unknown_price_carries_forward_last(self, monkeypatch):
        """Цена None + есть история → пишем последнюю известную, не 0."""
        mock_sb = self._setup_mock()
        monkeypatch.setattr("app.main.fetch_all", lambda q: [
            {"product_id": "pid-A", "stock_quantity": 10, "price": "100.00",
             "snapshot_time": "2026-05-19T12:00:00Z"},
        ])
        monkeypatch.setattr("app.main.get_supabase", lambda: mock_sb)

        snaps = [SnapshotInput(sku="A1", stock_quantity=8, price=None)]
        result = _persist_snapshots("seller-1", CONN_ID, SourceType.MARKETPLACE_API, snaps)

        assert result == 1
        rows = mock_sb.table.return_value.insert.call_args[0][0]
        assert rows[0]["price"] == 100.0       # перенесена последняя известная
        assert rows[0]["stock_quantity"] == 8

    def test_unknown_price_no_history_skipped(self, monkeypatch):
        """Цена None + нет истории → снапшот пропускается (не пишем фантомный 0)."""
        mock_sb = self._setup_mock()
        monkeypatch.setattr("app.main.fetch_all", lambda q: [])
        monkeypatch.setattr("app.main.get_supabase", lambda: mock_sb)

        snaps = [SnapshotInput(sku="A1", stock_quantity=8, price=None)]
        result = _persist_snapshots("seller-1", CONN_ID, SourceType.MARKETPLACE_API, snaps)

        assert result == 0
        mock_sb.table.return_value.insert.assert_not_called()

    def test_unknown_price_same_stock_dedup(self, monkeypatch):
        """Цена None + тот же сток → carry-forward даёт ту же цену → дедуп."""
        mock_sb = self._setup_mock()
        monkeypatch.setattr("app.main.fetch_all", lambda q: [
            {"product_id": "pid-A", "stock_quantity": 10, "price": "100.00",
             "snapshot_time": "2026-05-19T12:00:00Z"},
        ])
        monkeypatch.setattr("app.main.get_supabase", lambda: mock_sb)

        snaps = [SnapshotInput(sku="A1", stock_quantity=10, price=None)]
        result = _persist_snapshots("seller-1", CONN_ID, SourceType.MARKETPLACE_API, snaps)

        assert result == 0
