"""Кулдаун переоткрытия алертов (anti-churn) в recalc._upsert_or_skip_alert.

Проблема из прода: отакнутый «хронический» алерт (dead_inventory /
repeated_stockout / underestimated_sku) пересоздавался следующим же пересчётом.
Селлер акал одно и то же по кругу и переставал разгребать список — так накопилось
23k unack. Кулдаун: не воскрешаем такой алерт N дней после ack. Срочные типы
(critical/low_stock) под кулдаун НЕ подпадают — по ним напоминание уместно.
"""
from __future__ import annotations

from unittest.mock import MagicMock

from app.jobs import recalc


def _mock_sb(open_rows=None, cooldown_rows=None):
    """sb, где open-check (.is_) и cooldown-check (.gte) отдают заданные data."""
    sb = MagicMock()
    three_eq = (
        sb.table.return_value.select.return_value
        .eq.return_value.eq.return_value.eq.return_value
    )
    # existing-open: .is_("acknowledged_at","null").limit(1).execute()
    three_eq.is_.return_value.limit.return_value.execute.return_value = MagicMock(
        data=open_rows or []
    )
    # cooldown: .gte("acknowledged_at", cutoff).limit(1).execute()
    three_eq.gte.return_value.limit.return_value.execute.return_value = MagicMock(
        data=cooldown_rows or []
    )
    return sb


class TestRealertCooldown:
    def test_chronic_suppressed_when_recently_acked(self, monkeypatch):
        """dead_inventory отакнут недавно → новый алерт НЕ создаём."""
        monkeypatch.setenv("ALERT_REALERT_COOLDOWN_DAYS", "14")
        ins = MagicMock()
        monkeypatch.setattr(recalc, "execute_minimal", ins)
        sb = _mock_sb(open_rows=[], cooldown_rows=[{"id": "acked-recently"}])
        created = recalc._upsert_or_skip_alert(sb, "s", "p", "dead_inventory", "m", {})
        assert created is False
        ins.assert_not_called()

    def test_chronic_created_when_no_recent_ack(self, monkeypatch):
        """Нет свежего ack → алерт создаётся как обычно."""
        monkeypatch.setenv("ALERT_REALERT_COOLDOWN_DAYS", "14")
        ins = MagicMock()
        monkeypatch.setattr(recalc, "execute_minimal", ins)
        sb = _mock_sb(open_rows=[], cooldown_rows=[])
        created = recalc._upsert_or_skip_alert(sb, "s", "p", "repeated_stockout", "m", {})
        assert created is True
        ins.assert_called_once()

    def test_urgent_kind_ignores_cooldown(self, monkeypatch):
        """critical_stock создаётся даже при недавнем ack — кулдаун не для него."""
        monkeypatch.setenv("ALERT_REALERT_COOLDOWN_DAYS", "14")
        ins = MagicMock()
        monkeypatch.setattr(recalc, "execute_minimal", ins)
        sb = _mock_sb(open_rows=[], cooldown_rows=[{"id": "acked-recently"}])
        created = recalc._upsert_or_skip_alert(sb, "s", "p", "critical_stock", "m", {})
        assert created is True
        ins.assert_called_once()

    def test_cooldown_disabled_by_env_zero(self, monkeypatch):
        """ALERT_REALERT_COOLDOWN_DAYS=0 → кулдаун выключен, алерт создаётся."""
        monkeypatch.setenv("ALERT_REALERT_COOLDOWN_DAYS", "0")
        ins = MagicMock()
        monkeypatch.setattr(recalc, "execute_minimal", ins)
        sb = _mock_sb(open_rows=[], cooldown_rows=[{"id": "acked-recently"}])
        created = recalc._upsert_or_skip_alert(sb, "s", "p", "dead_inventory", "m", {})
        assert created is True
        ins.assert_called_once()

    def test_open_alert_updates_not_blocked_by_cooldown(self, monkeypatch):
        """Есть открытый алерт → обновляем его (return False), инсерта нет."""
        monkeypatch.setenv("ALERT_REALERT_COOLDOWN_DAYS", "14")
        ins = MagicMock()
        monkeypatch.setattr(recalc, "execute_minimal", ins)
        sb = _mock_sb(open_rows=[{"id": "open-1"}], cooldown_rows=[{"id": "x"}])
        created = recalc._upsert_or_skip_alert(sb, "s", "p", "dead_inventory", "m", {})
        assert created is False
        ins.assert_called_once()  # update открытого

    def test_helper_short_circuits_urgent_without_query(self):
        """_in_realert_cooldown для срочного типа отдаёт False без запроса к БД."""
        sb = MagicMock()
        assert recalc._in_realert_cooldown(sb, "s", "p", "critical_stock") is False
        sb.table.assert_not_called()

    def test_helper_true_for_chronic_recent_ack(self, monkeypatch):
        monkeypatch.setenv("ALERT_REALERT_COOLDOWN_DAYS", "14")
        sb = _mock_sb(cooldown_rows=[{"id": "acked-recently"}])
        assert recalc._in_realert_cooldown(sb, "s", "p", "dead_inventory") is True
