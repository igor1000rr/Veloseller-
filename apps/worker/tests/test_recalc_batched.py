"""Тесты recalc.py — БАГ 92 (batched fetch) + БАГ 93 (per-SKU try/except).

Покрываем:
  - _fetch_snapshots_batched: батчинг по _PRODUCT_IN_BATCH, группировка по pid, сортировка
  - recalc_seller per-SKU try/except: failed_skus, остальные SKU обработаны, store_metrics пишется
  - recalc_seller_all_periods per-period try/except: один период падает, другие проходят
"""
from __future__ import annotations
import os
os.environ["ENABLE_SCHEDULER"] = "false"

from datetime import date, datetime, timedelta, timezone
from unittest.mock import MagicMock, patch
from dataclasses import dataclass

import pytest


# ============================================================================
# _fetch_snapshots_batched (БАГ 92)
# ============================================================================

class TestFetchSnapshotsBatched:
    def test_groups_by_product_id(self):
        """Возвращает dict pid → list[rows]."""
        from app.jobs import recalc

        product_ids = ["pid-1", "pid-2", "pid-3"]
        all_rows = [
            {"product_id": "pid-1", "snapshot_time": "2026-05-19T10:00:00Z", "stock_quantity": 10, "price": 100, "availability": True, "snapshot_id": "s1"},
            {"product_id": "pid-2", "snapshot_time": "2026-05-19T10:00:00Z", "stock_quantity": 20, "price": 200, "availability": True, "snapshot_id": "s2"},
            {"product_id": "pid-1", "snapshot_time": "2026-05-20T10:00:00Z", "stock_quantity": 8, "price": 100, "availability": True, "snapshot_id": "s3"},
            {"product_id": "pid-3", "snapshot_time": "2026-05-19T10:00:00Z", "stock_quantity": 30, "price": 300, "availability": True, "snapshot_id": "s4"},
        ]
        mock_sb = MagicMock()

        with patch("app.jobs.recalc.fetch_all", return_value=all_rows):
            result = recalc._fetch_snapshots_batched(mock_sb, product_ids, "2026-04-14")

        assert set(result.keys()) == {"pid-1", "pid-2", "pid-3"}
        assert len(result["pid-1"]) == 2
        assert len(result["pid-2"]) == 1
        assert len(result["pid-3"]) == 1

    def test_sorts_each_pid_by_snapshot_time(self):
        """В пределах одного pid строки отсортированы по snapshot_time."""
        from app.jobs import recalc

        product_ids = ["pid-1"]
        all_rows = [
            {"product_id": "pid-1", "snapshot_time": "2026-05-20T10:00:00Z", "stock_quantity": 8, "price": 100, "availability": True, "snapshot_id": "s3"},
            {"product_id": "pid-1", "snapshot_time": "2026-05-19T10:00:00Z", "stock_quantity": 10, "price": 100, "availability": True, "snapshot_id": "s1"},
            {"product_id": "pid-1", "snapshot_time": "2026-05-21T10:00:00Z", "stock_quantity": 5, "price": 100, "availability": True, "snapshot_id": "s4"},
        ]
        mock_sb = MagicMock()

        with patch("app.jobs.recalc.fetch_all", return_value=all_rows):
            result = recalc._fetch_snapshots_batched(mock_sb, product_ids, "2026-04-14")

        times = [r["snapshot_time"] for r in result["pid-1"]]
        assert times == sorted(times)

    def test_empty_product_ids(self):
        """Пустой список pids → пустой dict, ни одного запроса."""
        from app.jobs import recalc

        mock_sb = MagicMock()
        fetch_called = {"n": 0}

        def fake(q):
            fetch_called["n"] += 1
            return []

        with patch("app.jobs.recalc.fetch_all", side_effect=fake):
            result = recalc._fetch_snapshots_batched(mock_sb, [], "2026-04-14")

        assert result == {}
        assert fetch_called["n"] == 0

    def test_batches_by_200(self):
        """600 pids → 3 batched fetch вызова (по 200)."""
        from app.jobs import recalc

        product_ids = [f"pid-{i}" for i in range(600)]
        mock_sb = MagicMock()
        fetch_calls = []

        def fake_fetch_all(query):
            fetch_calls.append("call")
            return []

        with patch("app.jobs.recalc.fetch_all", side_effect=fake_fetch_all):
            result = recalc._fetch_snapshots_batched(mock_sb, product_ids, "2026-04-14")

        assert len(fetch_calls) == 3
        assert len(result) == 600

    def test_missing_pid_in_response(self):
        """Если для pid нет snapshots — он всё равно в результате с пустым списком."""
        from app.jobs import recalc

        product_ids = ["pid-1", "pid-2"]
        all_rows = [
            {"product_id": "pid-1", "snapshot_time": "2026-05-19T10:00:00Z",
             "stock_quantity": 10, "price": 100, "availability": True, "snapshot_id": "s1"},
        ]
        mock_sb = MagicMock()

        with patch("app.jobs.recalc.fetch_all", return_value=all_rows):
            result = recalc._fetch_snapshots_batched(mock_sb, product_ids, "2026-04-14")

        assert result["pid-1"] == all_rows
        assert result["pid-2"] == []


# ============================================================================
# Fake Supabase для интеграционных тестов recalc
# ============================================================================

@dataclass
class FakeQuery:
    table: "FakeTable"
    op: str
    filters: list = None
    payload: object = None
    on_conflict: str = None
    range_: tuple = None
    order_arg: str = None
    limit_arg: int = None

    def __post_init__(self):
        if self.filters is None:
            self.filters = []

    def eq(self, k, v):
        self.filters.append(("eq", k, v))
        return self

    def gte(self, k, v):
        self.filters.append(("gte", k, v))
        return self

    def lte(self, k, v):
        self.filters.append(("lte", k, v))
        return self

    def in_(self, k, v):
        self.filters.append(("in", k, list(v)))
        return self

    def is_(self, k, v):
        self.filters.append(("is_null", k, v))
        return self

    def order(self, arg, desc=False):
        self.order_arg = arg
        return self

    def limit(self, n):
        self.limit_arg = n
        return self

    def range(self, s, e):
        self.range_ = (s, e)
        return self

    def execute(self):
        return self.table._execute(self)


class FakeTable:
    def __init__(self, name: str, store: dict):
        self.name = name
        self._store = store
        self._store.setdefault(name, [])

    def _matches(self, row, filters):
        for op, k, v in filters:
            if op == "eq" and row.get(k) != v:
                return False
            if op == "gte" and (row.get(k) is None or row[k] < v):
                return False
            if op == "lte" and (row.get(k) is None or row[k] > v):
                return False
            if op == "in" and row.get(k) not in v:
                return False
            if op == "is_null" and row.get(k) is not None:
                return False
        return True

    def _execute(self, q):
        rows = self._store[self.name]
        if q.op == "select":
            filtered = [r for r in rows if self._matches(r, q.filters)]
            if q.range_:
                s, e = q.range_
                filtered = filtered[s:e+1]
            if q.limit_arg:
                filtered = filtered[:q.limit_arg]
            return MagicMock(data=filtered)
        if q.op == "insert":
            new = q.payload if isinstance(q.payload, list) else [q.payload]
            rows.extend(new)
            return MagicMock(data=new)
        if q.op == "upsert":
            new = q.payload if isinstance(q.payload, list) else [q.payload]
            keys = (q.on_conflict or "").split(",")
            for n in new:
                replaced = False
                for i, existing in enumerate(rows):
                    if all(existing.get(k.strip()) == n.get(k.strip()) for k in keys):
                        rows[i] = n
                        replaced = True
                        break
                if not replaced:
                    rows.append(n)
            return MagicMock(data=new)
        if q.op == "update":
            for r in rows:
                if self._matches(r, q.filters):
                    r.update(q.payload)
            return MagicMock(data=rows)
        if q.op == "delete":
            keep = [r for r in rows if not self._matches(r, q.filters)]
            self._store[self.name] = keep
            return MagicMock(data=[])
        return MagicMock(data=[])

    def select(self, *args, **kwargs):
        return FakeQuery(self, "select")

    def insert(self, payload):
        return FakeQuery(self, "insert", payload=payload)

    def upsert(self, payload, on_conflict=None):
        return FakeQuery(self, "upsert", payload=payload, on_conflict=on_conflict)

    def update(self, payload):
        return FakeQuery(self, "update", payload=payload)

    def delete(self):
        return FakeQuery(self, "delete")


class FakeSupabase:
    def __init__(self):
        self._store = {}

    def table(self, name):
        return FakeTable(name, self._store)


def _make_seller_with_skus(num_skus: int) -> tuple[FakeSupabase, str]:
    """Заводит N SKUs с базовыми snapshots для seller'а."""
    sb = FakeSupabase()
    seller_id = "11111111-1111-1111-1111-111111111111"
    sb._store["sellers"] = [{"id": seller_id, "timezone": "UTC"}]
    sb._store["products"] = []
    sb._store["inventory_snapshots"] = []

    base_day = date.today() - timedelta(days=15)
    for i in range(num_skus):
        pid = f"00000000-0000-0000-0000-{i:012d}"
        sb._store["products"].append({"product_id": pid, "seller_id": seller_id, "sku": f"SKU-{i:04d}"})
        for d in range(10):
            ts = datetime.combine(base_day + timedelta(days=d), datetime.min.time(), tzinfo=timezone.utc)
            sb._store["inventory_snapshots"].append({
                "snapshot_id": f"snap-{i}-{d}",
                "product_id": pid,
                "snapshot_time": ts.isoformat(),
                "stock_quantity": max(0, 100 - d * 5),
                "price": 50.0,
                "availability": (100 - d * 5) > 0,
            })
    return sb, seller_id


class TestRecalcSellerTryExcept:
    """БАГ 93: один сбойный SKU не должен валить весь recalc."""

    def test_failed_sku_isolated_others_processed(self):
        """Если один SKU падает в compute_metrics_for_sku — остальные обрабатываются."""
        from app.jobs.recalc import recalc_seller

        sb, seller_id = _make_seller_with_skus(5)
        target_pid = "00000000-0000-0000-0000-000000000002"

        from app.engine.pipeline import compute_metrics_for_sku as real_compute

        def fake_compute(*args, **kwargs):
            if kwargs.get("product_id") == target_pid:
                raise ValueError("simulated compute error")
            return real_compute(*args, **kwargs)

        with patch("app.jobs.recalc.get_supabase", return_value=sb), \
             patch("app.jobs.recalc.compute_metrics_for_sku", side_effect=fake_compute):
            result = recalc_seller(seller_id, period_days=7)

        assert result["products"] == 5
        assert result["failed_skus"] == 1
        assert result["metrics_written"] == 4
        assert result["store_metrics_written"] == 1
        sm = sb._store["store_metrics"][0]
        assert sm["total_sku_count"] == 4

    def test_db_write_failure_isolated(self):
        """Если падает запись tvelo_metrics для SKU — остальные пишутся."""
        from app.jobs.recalc import recalc_seller

        sb, seller_id = _make_seller_with_skus(3)
        original_table = sb.table
        target_pid = "00000000-0000-0000-0000-000000000001"

        def patched_table(name):
            t = original_table(name)
            if name == "tvelo_metrics":
                original_upsert = t.upsert
                def fake_upsert(payload, on_conflict=None):
                    if isinstance(payload, dict) and payload.get("product_id") == target_pid:
                        raise Exception("simulated DB write error")
                    return original_upsert(payload, on_conflict=on_conflict)
                t.upsert = fake_upsert
            return t

        with patch("app.jobs.recalc.get_supabase", return_value=sb), \
             patch.object(sb, "table", side_effect=patched_table):
            result = recalc_seller(seller_id, period_days=7)

        assert result["failed_skus"] >= 1
        assert result["metrics_written"] == 2

    def test_all_periods_continue_when_one_fails(self):
        """recalc_seller_all_periods: один период падает → остальные пишутся."""
        from app.jobs.recalc import recalc_seller_all_periods

        sb, seller_id = _make_seller_with_skus(2)
        failed_periods = []

        def fake_recalc(seller_id, period_days=30, progress=None):
            if period_days == 30:
                failed_periods.append(period_days)
                raise RuntimeError("simulated 30-day failure")
            return {
                "products": 2, "failed_skus": 0,
                "metrics_written": 2, "alerts_written": 0,
                "events_written": 0, "changelog_written": 0,
                "store_metrics_written": 1,
            }

        with patch("app.jobs.recalc.get_supabase", return_value=sb), \
             patch("app.jobs.recalc.recalc_seller", side_effect=fake_recalc):
            result = recalc_seller_all_periods(seller_id)

        assert len(result["periods"]) == 3
        assert failed_periods == [30]
        p30 = [p for p in result["periods"] if p["period_days"] == 30][0]
        assert "error" in p30
        p7 = [p for p in result["periods"] if p["period_days"] == 7][0]
        assert p7["metrics_written"] == 2

    def test_no_failed_skus_when_all_ok(self):
        """failed_skus = 0 если все SKU обрабатываются нормально."""
        from app.jobs.recalc import recalc_seller

        sb, seller_id = _make_seller_with_skus(3)

        with patch("app.jobs.recalc.get_supabase", return_value=sb):
            result = recalc_seller(seller_id, period_days=7)

        assert result["failed_skus"] == 0
        assert result["metrics_written"] == 3


class TestRecalcBatchedFetchSpeedup:
    """БАГ 92: проверяем что recalc делает ОДИН batched fetch, не N per-SKU."""

    def test_one_batched_fetch_instead_of_n_per_sku(self):
        """Для 5 SKU — 1 fetch_all для inventory_snapshots, не 5."""
        from app.jobs import recalc

        sb, seller_id = _make_seller_with_skus(5)
        snapshot_fetch_count = {"n": 0}
        original_fetch_all = recalc.fetch_all

        def counting_fetch_all(query):
            try:
                table_name = query.table.name
                if table_name == "inventory_snapshots":
                    snapshot_fetch_count["n"] += 1
            except AttributeError:
                pass
            return original_fetch_all(query)

        with patch("app.jobs.recalc.get_supabase", return_value=sb), \
             patch("app.jobs.recalc.fetch_all", side_effect=counting_fetch_all):
            result = recalc.recalc_seller(seller_id, period_days=7)

        assert snapshot_fetch_count["n"] == 1
        assert result["products"] == 5
        assert result["metrics_written"] == 5
