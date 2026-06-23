"""Тесты period_window: tvelo_metrics и store_metrics пишутся по окнам 7/30/90 на
один period_end — отчёты должны брать ровно 30-дневное окно последнего периода."""
from __future__ import annotations

from datetime import date
from types import SimpleNamespace

from app.jobs.period_window import latest_30d_window, store_metric_30d


class _FakeQuery:
    def __init__(self, data): self._data = data
    def select(self, *a, **k): return self
    def eq(self, *a, **k): return self
    def lte(self, *a, **k): return self
    def order(self, *a, **k): return self
    def limit(self, *a, **k): return self
    def execute(self): return SimpleNamespace(data=self._data)


class _FakeSB:
    def __init__(self, data): self._data = data
    def table(self, *a, **k): return _FakeQuery(self._data)


def test_latest_30d_window_picks_30():
    data = [
        {"period_start": "2026-06-17", "period_end": "2026-06-23"},  # ~7д
        {"period_start": "2026-05-25", "period_end": "2026-06-23"},  # ~30д
        {"period_start": "2026-03-26", "period_end": "2026-06-23"},  # ~90д
    ]
    assert latest_30d_window(_FakeSB(data), "s1") == ("2026-05-25", "2026-06-23")


def test_latest_30d_window_empty():
    assert latest_30d_window(_FakeSB([]), "s1") == (None, None)


def test_store_metric_30d_picks_30():
    data = [
        {"period_start": "2026-06-17", "period_end": "2026-06-23", "lost_revenue": 7},
        {"period_start": "2026-05-25", "period_end": "2026-06-23", "lost_revenue": 30},
        {"period_start": "2026-03-26", "period_end": "2026-06-23", "lost_revenue": 90},
        {"period_start": "2026-05-24", "period_end": "2026-06-22", "lost_revenue": 99},
    ]
    row = store_metric_30d(_FakeSB(data), "s1", date(2026, 6, 23))
    assert row is not None and row["lost_revenue"] == 30  # 30-дневное окно последнего period_end


def test_store_metric_30d_empty():
    assert store_metric_30d(_FakeSB([]), "s1", date(2026, 6, 23)) is None
