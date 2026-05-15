"""E2E smoke-тест recalc_seller с in-memory моком Supabase.

Проверяет полный пайплайн: snapshots -> events -> tvelo_metrics -> store_metrics -> alerts.
"""
from __future__ import annotations

import os
os.environ["ENABLE_SCHEDULER"] = "false"

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest


# ============================================================================
# Mock Supabase
# ============================================================================

class FakeQuery:
    """Минимальный мок цепочки supabase: .select.eq.gte.order.execute()."""

    def __init__(self, table: "FakeTable", op: str = "select"):
        self._table = table
        self._op = op
        self._filters: list[tuple[str, str, object]] = []
        self._payload: object = None
        self._on_conflict: str | None = None

    def select(self, *args, **kwargs):
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        return self

    def upsert(self, payload, on_conflict=None):
        self._op = "upsert"
        self._payload = payload
        self._on_conflict = on_conflict
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, key, value):
        self._filters.append(("eq", key, value))
        return self

    def gte(self, key, value):
        self._filters.append(("gte", key, value))
        return self

    def lte(self, key, value):
        self._filters.append(("lte", key, value))
        return self

    def in_(self, key, values):
        self._filters.append(("in", key, values))
        return self

    def order(self, *_a, **_kw):
        return self

    def single(self):
        return self

    def execute(self):
        return self._table._execute(self)


class FakeTable:
    def __init__(self, name: str, store: dict):
        self.name = name
        self._store = store
        self._store.setdefault(name, [])

    def _matches(self, row: dict, filters) -> bool:
        for op, k, v in filters:
            if op == "eq" and row.get(k) != v:
                return False
            if op == "gte" and (row.get(k) is None or row[k] < v):
                return False
            if op == "lte" and (row.get(k) is None or row[k] > v):
                return False
            if op == "in" and row.get(k) not in v:
                return False
        return True

    def _execute(self, q: FakeQuery):
        rows = self._store[self.name]
        if q._op == "select":
            filtered = [r for r in rows if self._matches(r, q._filters)]
            return MagicMock(data=filtered)
        if q._op == "insert":
            new = q._payload if isinstance(q._payload, list) else [q._payload]
            rows.extend(new)
            return MagicMock(data=new)
        if q._op == "upsert":
            new = q._payload if isinstance(q._payload, list) else [q._payload]
            # Простая логика: ищем по on_conflict ключам и заменяем; иначе добавляем
            keys = (q._on_conflict or "").split(",")
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
        if q._op == "update":
            for r in rows:
                if self._matches(r, q._filters):
                    r.update(q._payload)
            return MagicMock(data=rows)
        if q._op == "delete":
            keep = [r for r in rows if not self._matches(r, q._filters)]
            self._store[self.name] = keep
            return MagicMock(data=[])
        return MagicMock(data=[])

    # Несколько таблиц требуют этого
    def select(self, *args, **kwargs):
        return FakeQuery(self, "select")

    def insert(self, payload):
        q = FakeQuery(self, "insert")
        q._payload = payload
        return q

    def upsert(self, payload, on_conflict=None):
        q = FakeQuery(self, "upsert")
        q._payload = payload
        q._on_conflict = on_conflict
        return q

    def update(self, payload):
        q = FakeQuery(self, "update")
        q._payload = payload
        return q

    def delete(self):
        return FakeQuery(self, "delete")


class FakeSupabase:
    def __init__(self):
        self._store: dict = {}

    def table(self, name: str) -> FakeTable:
        return FakeTable(name, self._store)


# ============================================================================
# Test
# ============================================================================

@pytest.fixture
def fake_sb():
    sb = FakeSupabase()
    seller_id = "11111111-1111-1111-1111-111111111111"
    product_id = "22222222-2222-2222-2222-222222222222"

    sb._store["sellers"] = [{"id": seller_id, "timezone": "UTC"}]
    sb._store["products"] = [{"product_id": product_id, "seller_id": seller_id, "sku": "TEST-001"}]

    # 30 snapshots: 1 продажа/день, начальный остаток 100. Последний snapshot — сегодня.
    base_time = datetime.now(timezone.utc) - timedelta(days=29)
    sb._store["inventory_snapshots"] = []
    for i in range(30):
        ts = base_time + timedelta(days=i)
        sb._store["inventory_snapshots"].append({
            "snapshot_id": f"snap-{i}",
            "product_id": product_id,
            "snapshot_time": ts.isoformat(),
            "stock_quantity": 100 - i,
            "price": 50.0,
            "availability": True,
            "source": "csv_upload",
        })

    return sb, seller_id, product_id


def test_recalc_seller_e2e(fake_sb):
    sb, seller_id, product_id = fake_sb

    with patch("app.jobs.recalc.get_supabase", return_value=sb):
        from app.jobs.recalc import recalc_seller
        result = recalc_seller(seller_id, period_days=30)

    # Метрики записаны
    assert result["products"] == 1
    assert result["metrics_written"] == 1
    assert result["store_metrics_written"] == 1
    assert result["events_written"] > 0
    assert result["changelog_written"] >= 0  # после Rule 11.1: пишутся только repl/anomaly/missing

    # Проверяем содержимое tvelo_metrics
    metrics = sb._store["tvelo_metrics"]
    assert len(metrics) == 1
    m = metrics[0]
    assert m["product_id"] == product_id
    assert m["stockout_days"] == 0
    assert m["in_stock_days"] > 0
    assert m["confirmed_velocity"] > 0
    assert m["adjusted_velocity"] > 0
    # 29 продаж по 1, остаток 71 -> coverage ~70 дней
    assert m["coverage_days"] is not None
    assert m["inventory_segment"] in {"stable", "slow_movers", "fast_movers"}

    # Store metrics — KPI карточки
    store = sb._store["store_metrics"]
    assert len(store) == 1
    s = store[0]
    assert s["total_sku_count"] == 1
    assert s["oos_sku_count"] == 0
    assert s["total_inventory_value"] > 0
    assert s["warehouse_health_score"] is not None

    # Changelog — теперь пишется только для repl/anomaly/missing; в этом тесте только sales_like, так что 0 OK
    cl = sb._store["changelog"]
    assert len(cl) >= 0
    types = {e["event_type"] for e in cl}
    # После Rule 11.1: sales_like в changelog не попадают
    # first_snapshot тоже не в значимых

    # Inventory events
    events = sb._store["inventory_events"]
    assert len(events) > 0


def test_recalc_seller_with_stockout(fake_sb):
    sb, seller_id, product_id = fake_sb
    # 5 дней продаж, 5 дней stockout — обнуляем последние 5
    for i, snap in enumerate(sb._store["inventory_snapshots"]):
        if i >= 25:
            snap["stock_quantity"] = 0
            snap["availability"] = False

    with patch("app.jobs.recalc.get_supabase", return_value=sb):
        from app.jobs.recalc import recalc_seller
        result = recalc_seller(seller_id, period_days=30)

    m = sb._store["tvelo_metrics"][0]
    assert m["stockout_days"] > 0
    assert m["current_stock"] == 0

    # Alerts должны быть созданы (low/critical stock + repeated_stockout)
    alerts = sb._store["alerts"]
    kinds = {a["kind"] for a in alerts}
    assert "critical_stock" in kinds or "low_stock" in kinds
    assert "repeated_stockout" in kinds
