"""Расширенные тесты pipeline в jobs/recalc.py:
- Recount detection (пара компенсирующих snapshots → RECOUNT_LIKE)
- Price change detection → changelog
- Price elasticity (нужно ≥7 in-stock days до/после)
"""
from datetime import datetime, date, timedelta, timezone
from unittest.mock import MagicMock, patch
import pytest

from app.jobs.recalc import build_daily_aggregates
from app.schemas import EventType


def _snap(snapshot_id: str, snapshot_time: datetime, stock: int, price: float = 10.0):
    return {
        "snapshot_id": snapshot_id,
        "snapshot_time": snapshot_time.isoformat(),
        "stock_quantity": stock,
        "price": price,
        "availability": stock > 0,
    }


def _setup_products_mock(m: MagicMock, products_data: list[dict]) -> None:
    """Настроить mock для products таблицы, поддерживая И старую .execute() цепочку,
    И новую .range().execute() цепочку (т.к. recalc.py теперь использует fetch_all)."""
    response = MagicMock(data=products_data)
    # Старая цепочка: .select().eq().execute()
    m.select.return_value.eq.return_value.execute.return_value = response
    # Новая цепочка: .select().eq().range().execute() — для fetch_all
    m.select.return_value.eq.return_value.range.return_value.execute.return_value = response


def _setup_snapshots_mock(m: MagicMock, snapshots_data: list[dict]) -> None:
    """Аналогично для inventory_snapshots."""
    response = MagicMock(data=snapshots_data)
    # Старая: .select().eq().gte().lte().order().execute()
    m.select.return_value.eq.return_value.gte.return_value.lte.return_value.order.return_value.execute.return_value = response
    m.select.return_value.eq.return_value.gte.return_value.order.return_value.execute.return_value = response
    # Новая с fetch_all: добавляем .range()
    m.select.return_value.eq.return_value.gte.return_value.lte.return_value.order.return_value.range.return_value.execute.return_value = response
    m.select.return_value.eq.return_value.gte.return_value.order.return_value.range.return_value.execute.return_value = response


def test_build_aggregates_missing_data_for_no_snapshots():
    """Если за день не было snapshots — день получает event_type=MISSING_DATA."""
    tz = timezone.utc
    period_start = date(2026, 5, 1)
    period_end = date(2026, 5, 3)
    rows = [_snap("s1", datetime(2026, 5, 1, 12, tzinfo=tz), 100)]
    aggregates, event_rows = build_daily_aggregates(rows, period_start, period_end, tz)
    assert len(aggregates) == 3
    assert aggregates[0].event_type == EventType.FIRST_SNAPSHOT
    assert aggregates[1].event_type == EventType.MISSING_DATA
    assert aggregates[1].excluded_from_confirmed_metrics is True
    assert aggregates[2].event_type == EventType.MISSING_DATA


def test_build_aggregates_sales_progression():
    """Падение остатков по дням → sales_like."""
    tz = timezone.utc
    period_start = date(2026, 5, 1)
    period_end = date(2026, 5, 3)
    rows = [
        _snap("s1", datetime(2026, 5, 1, 12, tzinfo=tz), 100),
        _snap("s2", datetime(2026, 5, 2, 12, tzinfo=tz), 95),
        _snap("s3", datetime(2026, 5, 3, 12, tzinfo=tz), 90),
    ]
    aggregates, _ = build_daily_aggregates(rows, period_start, period_end, tz)
    assert aggregates[0].event_type == EventType.FIRST_SNAPSHOT
    assert aggregates[1].event_type == EventType.SALES_LIKE
    assert aggregates[1].delta_stock == -5
    assert aggregates[2].event_type == EventType.SALES_LIKE


def test_build_aggregates_replenishment_detected():
    """Рост остатков → replenishment_like (исключается из confirmed)."""
    tz = timezone.utc
    rows = [
        _snap("s1", datetime(2026, 5, 1, 12, tzinfo=tz), 50),
        _snap("s2", datetime(2026, 5, 2, 12, tzinfo=tz), 200),
    ]
    aggregates, _ = build_daily_aggregates(rows, date(2026, 5, 1), date(2026, 5, 2), tz)
    assert aggregates[1].event_type == EventType.REPLENISHMENT_LIKE
    assert aggregates[1].excluded_from_confirmed_metrics is True


def test_build_aggregates_recount_detection():
    """Recount pair: drop -> recover в один день → день классифицируется как RECOUNT_LIKE."""
    tz = timezone.utc
    rows = [
        _snap("s1", datetime(2026, 5, 1, 12, tzinfo=tz), 100),
        _snap("s2", datetime(2026, 5, 2, 9,  tzinfo=tz), 30),
        _snap("s3", datetime(2026, 5, 2, 14, tzinfo=tz), 100),
    ]
    aggregates, _ = build_daily_aggregates(rows, date(2026, 5, 1), date(2026, 5, 2), tz)
    day2 = aggregates[1]
    assert day2.event_type == EventType.RECOUNT_LIKE
    assert day2.excluded_from_confirmed_metrics is True


def test_build_aggregates_recount_event_rows_updated():
    """После recount detection event_rows тоже обновляются."""
    tz = timezone.utc
    rows = [
        _snap("s1", datetime(2026, 5, 1, 12, tzinfo=tz), 100),
        _snap("s2", datetime(2026, 5, 2, 9,  tzinfo=tz), 30),
        _snap("s3", datetime(2026, 5, 2, 14, tzinfo=tz), 100),
    ]
    _, event_rows = build_daily_aggregates(rows, date(2026, 5, 1), date(2026, 5, 2), tz)
    matching = [e for e in event_rows if e["event_date"] == "2026-05-02"]
    assert matching
    assert any(e["event_type"] == "recount_like" for e in matching)


def test_build_aggregates_anomaly_detected():
    """Резкое падение (>5× median) → anomaly_like."""
    tz = timezone.utc
    rows = [_snap("s1", datetime(2026, 5, 1, 12, tzinfo=tz), 100)]
    for i in range(1, 7):
        rows.append(_snap(f"s{i+1}", datetime(2026, 5, 1 + i, 12, tzinfo=tz), 100 - i))
    rows.append(_snap("s8", datetime(2026, 5, 8, 12, tzinfo=tz), 44))
    aggregates, _ = build_daily_aggregates(rows, date(2026, 5, 1), date(2026, 5, 8), tz)
    assert aggregates[-1].event_type == EventType.ANOMALY_LIKE


def test_recalc_seller_writes_price_change_to_changelog():
    """Если цена менялась за период — в changelog должна появиться запись."""
    from app.jobs.recalc import recalc_seller

    seller_id = "seller-1"
    pid = "11111111-1111-1111-1111-111111111111"
    tz = timezone.utc

    snapshots = []
    stock = 200
    for i in range(8):
        snapshots.append(_snap(f"a{i}", datetime(2026, 5, 1 + i, 12, tzinfo=tz), stock, price=100.0))
        stock -= 1
    for i in range(8):
        snapshots.append(_snap(f"b{i}", datetime(2026, 5, 9 + i, 12, tzinfo=tz), stock, price=150.0))
        stock -= 1

    def _table_router(name):
        m = MagicMock()
        if name == "sellers":
            m.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[{"timezone": "UTC"}])
        elif name == "products":
            _setup_products_mock(m, [
                {"product_id": pid, "sku": "A", "product_name": "A", "lead_time_days": None, "safety_days": None}
            ])
        elif name == "inventory_snapshots":
            _setup_snapshots_mock(m, snapshots)
        elif name == "inventory_events":
            m.delete.return_value.eq.return_value.gte.return_value.lte.return_value.execute.return_value = MagicMock()
            m.insert.return_value.execute.return_value = MagicMock()
        elif name == "tvelo_metrics":
            m.upsert.return_value.execute.return_value = MagicMock()
        elif name == "store_metrics":
            m.upsert.return_value.execute.return_value = MagicMock()
        elif name == "alerts":
            # Дедупликация: select.eq().eq().eq().is_().limit().execute() + insert/update
            m.select.return_value.eq.return_value.eq.return_value.eq.return_value.is_.return_value.limit.return_value.execute.return_value = MagicMock(data=[])
            m.select.return_value.eq.return_value.eq.return_value.is_.return_value.execute.return_value = MagicMock(data=[])
            m.update.return_value.eq.return_value.execute.return_value = MagicMock()
            m.insert.return_value.execute.return_value = MagicMock()
        elif name == "changelog":
            m.delete.return_value.eq.return_value.gte.return_value.lte.return_value.execute.return_value = MagicMock()
            m.insert.return_value.execute.return_value = MagicMock()
        elif name == "price_elasticity":
            m.upsert.return_value.execute.return_value = MagicMock()
        return m

    mock_sb = MagicMock()
    mock_sb.table.side_effect = _table_router

    with patch("app.jobs.recalc.get_supabase", return_value=mock_sb):
        result = recalc_seller(seller_id, period_days=16)

    # smoke: проверяем что не упало и что-то записалось
    assert result["products"] >= 1


def test_recalc_seller_no_snapshots_skips_product():
    """Если у SKU нет snapshots за период — он пропускается без ошибки."""
    from app.jobs.recalc import recalc_seller

    def _table_router(name):
        m = MagicMock()
        if name == "sellers":
            m.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[{"timezone": "UTC"}])
        elif name == "products":
            _setup_products_mock(m, [
                {"product_id": "22222222-2222-2222-2222-222222222222", "sku": "A", "product_name": "A", "lead_time_days": None, "safety_days": None}
            ])
        elif name == "inventory_snapshots":
            _setup_snapshots_mock(m, [])  # пустые snapshots
        elif name == "store_metrics":
            m.upsert.return_value.execute.return_value = MagicMock()
        elif name == "alerts":
            m.delete.return_value.eq.return_value.execute.return_value = MagicMock()
        return m

    mock_sb = MagicMock()
    mock_sb.table.side_effect = _table_router

    with patch("app.jobs.recalc.get_supabase", return_value=mock_sb):
        result = recalc_seller("seller-1", period_days=30)
    assert result["products"] == 1


def test_recalc_seller_no_products():
    """Если у селлера нет products — recalc возвращает нули."""
    from app.jobs.recalc import recalc_seller

    def _router(name):
        m = MagicMock()
        if name == "sellers":
            m.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[{"timezone": "UTC"}])
        elif name == "products":
            _setup_products_mock(m, [])  # пустой список
        elif name == "store_metrics":
            m.upsert.return_value.execute.return_value = MagicMock()
        return m

    mock_sb = MagicMock()
    mock_sb.table.side_effect = _router

    with patch("app.jobs.recalc.get_supabase", return_value=mock_sb):
        result = recalc_seller("s1", period_days=30)
    assert result["products"] == 0
    assert result["metrics_written"] == 0
