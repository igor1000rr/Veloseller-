"""Тесты правки 11 Александра (Veloseller правки 4):
подписки на отчёты бывают weekly (дефолт) и monthly.

Monthly = только в ПЕРВЫЙ day_of_week месяца. То есть today.day должен быть <= 7.
- Если сегодня пн, 5 мая → monthly-подписка с day_of_week=1 срабатывает (5<=7)
- Если сегодня пн, 12 мая → monthly-подписка НЕ срабатывает (12>7), это второй пн
"""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest


def _setup_dispatcher_mocks(monkeypatch, today: datetime, subs: list[dict]):
    """Поднять моки для dispatch_daily_reports.

    Возвращает dict с трекером seller'ов, для которых вызвался _fetch_sku_rows
    (= реально обработанные).
    """
    import app.jobs.reports as reports_mod

    class FakeDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return today

    monkeypatch.setattr(reports_mod, "datetime", FakeDateTime)
    monkeypatch.setattr(reports_mod, "fetch_all", lambda q: subs)
    monkeypatch.setattr(reports_mod, "_already_sent_today", lambda sb, sid, ch: False)
    monkeypatch.setattr(reports_mod, "_record_history", lambda *a, **kw: None)

    tracker = {"sellers": set()}

    def fake_fetch_rows(sb, sid, kind, params):
        tracker["sellers"].add(sid)
        return []

    monkeypatch.setattr(reports_mod, "_fetch_sku_rows", fake_fetch_rows)

    mock_sb = MagicMock()
    seller_single = MagicMock()
    seller_single.execute.return_value.data = {
        "id": "any", "email": "a@b.com", "display_name": "A",
        "currency": "RUB", "telegram_chat_id": None,
        "notify_email": True, "notify_telegram": True,
    }
    mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value = seller_single
    monkeypatch.setattr(reports_mod, "get_supabase", lambda: mock_sb)

    return tracker


class TestFrequencyWeekly:
    """weekly или frequency=None — работает каждый day_of_week (старое поведение)."""

    def test_weekly_runs_every_matching_day(self, monkeypatch):
        """Пн 12 мая (второй пн) — weekly всё равно срабатывает."""
        today = datetime(2026, 5, 12, 9, 0, tzinfo=timezone.utc)
        # 12 мая 2026 = вторник; возьмём пн 4 мая вместо
        today = datetime(2026, 5, 11, 9, 0, tzinfo=timezone.utc)  # пн 11 мая (второй пн)
        assert today.isoweekday() == 1
        assert today.day > 7  # второй пн месяца

        subs = [{
            "seller_id": "weekly-s", "kind": "low_stock", "channel": "email",
            "enabled": True,
            "params": {"day_of_week": 1, "coverage_days_threshold": 7},
            "frequency": "weekly",
        }]
        tracker = _setup_dispatcher_mocks(monkeypatch, today, subs)

        from app.jobs.reports import dispatch_daily_reports
        dispatch_daily_reports()

        assert "weekly-s" in tracker["sellers"]

    def test_frequency_none_defaults_to_weekly(self, monkeypatch):
        """Старые подписки без frequency в выборке — трактуются как weekly."""
        today = datetime(2026, 5, 11, 9, 0, tzinfo=timezone.utc)  # 2-й пн месяца
        subs = [{
            "seller_id": "legacy-s", "kind": "low_stock", "channel": "email",
            "enabled": True,
            "params": {"day_of_week": 1, "coverage_days_threshold": 7},
            # frequency НЕ передан
        }]
        tracker = _setup_dispatcher_mocks(monkeypatch, today, subs)

        from app.jobs.reports import dispatch_daily_reports
        dispatch_daily_reports()

        assert "legacy-s" in tracker["sellers"]


class TestFrequencyMonthly:
    """monthly работает только в первый day_of_week месяца."""

    def test_monthly_skipped_on_second_monday(self, monkeypatch):
        """11 мая 2026 = второй пн (today.day=11 > 7) → monthly НЕ срабатывает."""
        today = datetime(2026, 5, 11, 9, 0, tzinfo=timezone.utc)
        assert today.isoweekday() == 1
        assert today.day > 7

        subs = [{
            "seller_id": "monthly-s", "kind": "weekly_report", "channel": "email",
            "enabled": True,
            "params": {"day_of_week": 1},
            "frequency": "monthly",
        }]
        tracker = _setup_dispatcher_mocks(monkeypatch, today, subs)

        from app.jobs.reports import dispatch_daily_reports
        dispatch_daily_reports()

        # monthly-s НЕ попадает в обработку
        assert "monthly-s" not in tracker["sellers"]

    def test_monthly_runs_on_first_monday(self, monkeypatch):
        """4 мая 2026 = первый пн месяца (4 <= 7) → monthly срабатывает."""
        today = datetime(2026, 5, 4, 9, 0, tzinfo=timezone.utc)
        assert today.isoweekday() == 1  # пн
        assert today.day <= 7  # первый пн

        subs = [{
            "seller_id": "monthly-s", "kind": "weekly_report", "channel": "email",
            "enabled": True,
            "params": {"day_of_week": 1},
            "frequency": "monthly",
        }]
        tracker = _setup_dispatcher_mocks(monkeypatch, today, subs)

        from app.jobs.reports import dispatch_daily_reports
        dispatch_daily_reports()

        assert "monthly-s" in tracker["sellers"]

    def test_monthly_runs_on_day_7_exactly(self, monkeypatch):
        """day_of_week=7 + today.day=7 → на границе включающе. Проверяем <=.

        7 января 2027 — четверг (isoweekday=4), не подходит прямо. Ищем день
        с day=7 и известным isoweekday: 7 декабря 2026 — понедельник.
        """
        today = datetime(2026, 12, 7, 9, 0, tzinfo=timezone.utc)
        assert today.isoweekday() == 1
        assert today.day == 7

        subs = [{
            "seller_id": "monthly-s", "kind": "weekly_report", "channel": "email",
            "enabled": True,
            "params": {"day_of_week": 1},
            "frequency": "monthly",
        }]
        tracker = _setup_dispatcher_mocks(monkeypatch, today, subs)

        from app.jobs.reports import dispatch_daily_reports
        dispatch_daily_reports()

        # 7 == 7 → всё ещё «первый пн» (<=7)
        assert "monthly-s" in tracker["sellers"]

    def test_monthly_skipped_on_day_8(self, monkeypatch):
        """День=8 → monthly пропускается даже если это нужный day_of_week.

        8 декабря 2026 — вторник, найдём день=8 с известным isoweekday:
        8 июня 2026 — понедельник.
        """
        today = datetime(2026, 6, 8, 9, 0, tzinfo=timezone.utc)
        assert today.isoweekday() == 1
        assert today.day == 8

        subs = [{
            "seller_id": "monthly-s", "kind": "weekly_report", "channel": "email",
            "enabled": True,
            "params": {"day_of_week": 1},
            "frequency": "monthly",
        }]
        tracker = _setup_dispatcher_mocks(monkeypatch, today, subs)

        from app.jobs.reports import dispatch_daily_reports
        dispatch_daily_reports()

        # 8 > 7 → это уже второй пн месяца
        assert "monthly-s" not in tracker["sellers"]

    def test_monthly_skipped_when_wrong_dow(self, monkeypatch):
        """day_of_week=3 (ср), today=4 (пн) → monthly пропускается по dow."""
        today = datetime(2026, 5, 4, 9, 0, tzinfo=timezone.utc)  # пн, день 4
        assert today.isoweekday() == 1

        subs = [{
            "seller_id": "monthly-s", "kind": "weekly_report", "channel": "email",
            "enabled": True,
            "params": {"day_of_week": 3},  # среда
            "frequency": "monthly",
        }]
        tracker = _setup_dispatcher_mocks(monkeypatch, today, subs)

        from app.jobs.reports import dispatch_daily_reports
        dispatch_daily_reports()

        # Не тот day_of_week — пропуск
        assert "monthly-s" not in tracker["sellers"]


class TestMixedFrequencies:
    """Когда у разных sellers разная частота."""

    def test_weekly_runs_monthly_skipped_on_second_monday(self, monkeypatch):
        """На второй пн месяца: weekly работает, monthly НЕТ."""
        today = datetime(2026, 5, 11, 9, 0, tzinfo=timezone.utc)  # 2-й пн

        subs = [
            {
                "seller_id": "weekly-s", "kind": "low_stock", "channel": "email",
                "enabled": True,
                "params": {"day_of_week": 1, "coverage_days_threshold": 7},
                "frequency": "weekly",
            },
            {
                "seller_id": "monthly-s", "kind": "weekly_report", "channel": "email",
                "enabled": True,
                "params": {"day_of_week": 1},
                "frequency": "monthly",
            },
        ]
        tracker = _setup_dispatcher_mocks(monkeypatch, today, subs)

        from app.jobs.reports import dispatch_daily_reports
        dispatch_daily_reports()

        assert "weekly-s" in tracker["sellers"]
        assert "monthly-s" not in tracker["sellers"]

    def test_both_run_on_first_monday(self, monkeypatch):
        """На первый пн месяца: и weekly и monthly работают."""
        today = datetime(2026, 5, 4, 9, 0, tzinfo=timezone.utc)  # 1-й пн

        subs = [
            {
                "seller_id": "weekly-s", "kind": "low_stock", "channel": "email",
                "enabled": True,
                "params": {"day_of_week": 1, "coverage_days_threshold": 7},
                "frequency": "weekly",
            },
            {
                "seller_id": "monthly-s", "kind": "weekly_report", "channel": "email",
                "enabled": True,
                "params": {"day_of_week": 1},
                "frequency": "monthly",
            },
        ]
        tracker = _setup_dispatcher_mocks(monkeypatch, today, subs)

        from app.jobs.reports import dispatch_daily_reports
        dispatch_daily_reports()

        assert "weekly-s" in tracker["sellers"]
        assert "monthly-s" in tracker["sellers"]
