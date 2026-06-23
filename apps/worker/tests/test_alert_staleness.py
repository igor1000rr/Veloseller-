"""data_stale guard в recalc._write_alerts — НЕ открываем low/critical stock-алерты
на устаревшем снапшоте (застрявший синк → current_stock/coverage ненадёжны).
dead/repeated_stockout/underestimated историчны и не подавляются.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

from app.jobs import recalc


def _metric(cov, stockout=0):
    # _write_alerts при пустом existing_active читает только эти поля.
    return SimpleNamespace(coverage_days=cov, stockout_days=stockout, segment=None, current_stock=5)


def _mock_sb_no_existing():
    sb = MagicMock()
    (sb.table.return_value.select.return_value
        .eq.return_value.eq.return_value.is_.return_value
        .execute.return_value) = MagicMock(data=[])
    return sb


def _capture(monkeypatch):
    created = []
    monkeypatch.setattr(
        recalc, "_upsert_or_skip_alert",
        lambda sb, sid, pid, kind, msg, payload: (created.append(kind), True)[1],
    )
    return created


def test_stale_suppresses_low_and_critical(monkeypatch):
    created = _capture(monkeypatch)
    recalc._write_alerts(_mock_sb_no_existing(), "s", "p", _metric(2.0), False, data_stale=True)
    assert "critical_stock" not in created
    assert "low_stock" not in created


def test_fresh_data_fires_critical(monkeypatch):
    created = _capture(monkeypatch)
    recalc._write_alerts(_mock_sb_no_existing(), "s", "p", _metric(2.0), False, data_stale=False)
    assert "critical_stock" in created


def test_stale_still_allows_repeated_stockout(monkeypatch):
    created = _capture(monkeypatch)
    recalc._write_alerts(_mock_sb_no_existing(), "s", "p", _metric(2.0, stockout=10), False, data_stale=True)
    assert "critical_stock" not in created
    assert "repeated_stockout" in created  # историчный — не подавляется
