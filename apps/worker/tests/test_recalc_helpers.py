"""Тесты вспомогательных функций jobs/recalc.py."""
from datetime import date, datetime, timezone

import pytz

from app.jobs.recalc import (
    _event_message,
    _confidence_impact,
    _extract_pre_period_sales_deltas,
)
from app.schemas import EventType


def test_event_message_sales_like():
    assert "Продажа" in _event_message(EventType.SALES_LIKE, -5)
    assert "5" in _event_message(EventType.SALES_LIKE, -5)


def test_event_message_replenishment():
    msg = _event_message(EventType.REPLENISHMENT_LIKE, 100)
    assert "Пополнение" in msg
    assert "100" in msg


def test_event_message_anomaly():
    msg = _event_message(EventType.ANOMALY_LIKE, -50)
    assert "Аномалия" in msg


def test_event_message_missing_data():
    msg = _event_message(EventType.MISSING_DATA, None)
    assert "Нет данных" in msg


def test_event_message_first_snapshot():
    msg = _event_message(EventType.FIRST_SNAPSHOT, None)
    assert "Первый снимок" in msg or "снимок" in msg.lower()


def test_event_message_no_change():
    msg = _event_message(EventType.NO_CHANGE, 0)
    assert "Без изменений" in msg


def test_event_message_recount_fallback():
    """Recount возвращает str(et.value) — fallback ветка."""
    msg = _event_message(EventType.RECOUNT_LIKE, -10)
    assert msg


def test_confidence_impact_negative_events():
    """Replenishment / anomaly / missing_data — отрицательное влияние."""
    assert _confidence_impact(EventType.REPLENISHMENT_LIKE) < 0
    assert _confidence_impact(EventType.ANOMALY_LIKE) < 0
    assert _confidence_impact(EventType.MISSING_DATA) < 0


def test_confidence_impact_zero_for_neutral():
    """Sales_like / no_change / first_snapshot — без влияния (0.0)."""
    assert _confidence_impact(EventType.SALES_LIKE) == 0.0
    assert _confidence_impact(EventType.NO_CHANGE) == 0.0
    assert _confidence_impact(EventType.FIRST_SNAPSHOT) == 0.0


# ============================================================================
# БАГ 10: pre-period sales deltas нормализуются на days_gap
# ============================================================================


def _mk_row(day: date, stock: int, hour: int = 12) -> dict:
    """Хелпер для построения snapshot row (UTC)."""
    ts = datetime(day.year, day.month, day.day, hour, tzinfo=timezone.utc)
    return {
        "snapshot_time": ts.isoformat(),
        "stock_quantity": stock,
    }


class TestExtractPrePeriodSalesDeltasNormalization:
    """БАГ 10 — pre-period дельты должны нормализоваться на дни между snapshot'ами."""

    def test_consecutive_days_no_normalization(self):
        """Если snapshots каждый день — нет деления, дельта как есть."""
        period_start = date(2026, 5, 1)
        rows = [
            _mk_row(date(2026, 4, 20), 100),
            _mk_row(date(2026, 4, 21), 95),  # -5
            _mk_row(date(2026, 4, 22), 90),  # -5
            _mk_row(date(2026, 4, 23), 85),  # -5
        ]
        deltas = _extract_pre_period_sales_deltas(rows, period_start, pytz.UTC)
        # 3 дельты по 5
        assert deltas == [5.0, 5.0, 5.0]

    def test_5_day_gap_normalizes(self):
        """5 дней пропуска, дельта -50 → должна стать 10 в день, не 50."""
        period_start = date(2026, 5, 1)
        rows = [
            _mk_row(date(2026, 4, 20), 100),
            _mk_row(date(2026, 4, 25), 50),  # -50 за 5 дней
            _mk_row(date(2026, 4, 30), 0),   # -50 за 5 дней
        ]
        deltas = _extract_pre_period_sales_deltas(rows, period_start, pytz.UTC)
        # Каждая дельта = 50/5 = 10
        assert deltas == [10.0, 10.0]

    def test_mixed_gaps(self):
        """Смешанные интервалы — каждая дельта нормализуется отдельно."""
        period_start = date(2026, 5, 1)
        rows = [
            _mk_row(date(2026, 4, 20), 100),
            _mk_row(date(2026, 4, 21), 95),   # gap=1, delta=-5, normalized=5
            _mk_row(date(2026, 4, 28), 75),   # gap=7, delta=-20, normalized=20/7≈2.86
            _mk_row(date(2026, 4, 30), 65),   # gap=2, delta=-10, normalized=5
        ]
        deltas = _extract_pre_period_sales_deltas(rows, period_start, pytz.UTC)
        assert len(deltas) == 3
        assert deltas[0] == 5.0
        assert abs(deltas[1] - 20/7) < 0.001
        assert deltas[2] == 5.0

    def test_replenishment_ignored(self):
        """Положительные дельты (пополнение) не идут в sales deltas."""
        period_start = date(2026, 5, 1)
        rows = [
            _mk_row(date(2026, 4, 20), 50),
            _mk_row(date(2026, 4, 21), 150),  # +100 пополнение
            _mk_row(date(2026, 4, 22), 140),  # -10 продажа
        ]
        deltas = _extract_pre_period_sales_deltas(rows, period_start, pytz.UTC)
        assert deltas == [10.0]

    def test_only_period_snapshots_ignored(self):
        """Snapshot'ы внутри периода игнорируются."""
        period_start = date(2026, 5, 1)
        rows = [
            _mk_row(date(2026, 5, 5), 100),  # внутри периода
            _mk_row(date(2026, 5, 6), 90),
        ]
        deltas = _extract_pre_period_sales_deltas(rows, period_start, pytz.UTC)
        assert deltas == []

    def test_anomaly_outlier_filtered(self):
        """Дельта >5× median считается аномалией и выкидывается."""
        period_start = date(2026, 5, 1)
        # 4 нормальные дельты по 5 + 1 аномалия 100 → median=5, фильтр >25
        rows = [
            _mk_row(date(2026, 4, 20), 200),
            _mk_row(date(2026, 4, 21), 195),  # -5
            _mk_row(date(2026, 4, 22), 190),  # -5
            _mk_row(date(2026, 4, 23), 90),   # -100 (аномалия)
            _mk_row(date(2026, 4, 24), 85),   # -5
            _mk_row(date(2026, 4, 25), 80),   # -5
        ]
        deltas = _extract_pre_period_sales_deltas(rows, period_start, pytz.UTC)
        # Все 5, без 100
        assert 100.0 not in deltas
        assert len(deltas) == 4

    def test_single_snapshot_returns_empty(self):
        """Только один snapshot — нет дельт."""
        period_start = date(2026, 5, 1)
        rows = [_mk_row(date(2026, 4, 20), 100)]
        assert _extract_pre_period_sales_deltas(rows, period_start, pytz.UTC) == []

    def test_no_pre_period_data_returns_empty(self):
        """Только snapshot'ы внутри периода — пусто."""
        period_start = date(2026, 5, 1)
        rows = [_mk_row(date(2026, 5, 2), 100)]
        assert _extract_pre_period_sales_deltas(rows, period_start, pytz.UTC) == []

    def test_timezone_handling(self):
        """Snapshot в TZ селлера определяет принадлежность к периоду."""
        moscow = pytz.timezone("Europe/Moscow")  # UTC+3
        period_start = date(2026, 5, 1)
        # 30 апреля 23:00 UTC = 1 мая 02:00 Moscow → УЖЕ в периоде → не учитывается
        rows = [
            {
                "snapshot_time": datetime(2026, 4, 28, 12, tzinfo=timezone.utc).isoformat(),
                "stock_quantity": 100,
            },
            {
                # 30 апреля 23:00 UTC = 1 мая 02:00 Moscow — это уже период
                "snapshot_time": datetime(2026, 4, 30, 23, tzinfo=timezone.utc).isoformat(),
                "stock_quantity": 50,
            },
            {
                # 28 апреля 20:00 UTC = 28 апреля 23:00 Moscow — пред-период
                "snapshot_time": datetime(2026, 4, 29, 12, tzinfo=timezone.utc).isoformat(),
                "stock_quantity": 80,
            },
        ]
        deltas = _extract_pre_period_sales_deltas(rows, period_start, moscow)
        # Только 28 апреля и 29 апреля попадают в pre-period (по Moscow time)
        # 28 апр: 100, 29 апр: 80 → delta=-20 за 1 день = 20
        assert deltas == [20.0]
