"""Тесты scheduler.py — БАГ 30/31 пагинация + per-seller try/catch + БАГ 89/90."""
from __future__ import annotations
import os
os.environ["ENABLE_SCHEDULER"] = "false"

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch


class TestDailyDigestPerSellerTryCatch:
    """БАГ 30: один упавший email/telegram не должен валить digest для остальных."""

    def test_continues_on_email_failure(self, monkeypatch):
        """Если для одного seller email падает, для других продолжаем."""
        mock_sb = MagicMock()
        sellers_data = [
            {"id": "s1", "email": "a@b.com", "display_name": "A", "telegram_chat_id": None,
             "notify_email": True, "notify_telegram": False},
            {"id": "s2", "email": "b@b.com", "display_name": "B", "telegram_chat_id": None,
             "notify_email": True, "notify_telegram": False},
            {"id": "s3", "email": "c@b.com", "display_name": "C", "telegram_chat_id": None,
             "notify_email": True, "notify_telegram": False},
        ]
        monkeypatch.setattr("app.jobs.scheduler.fetch_all", lambda q: sellers_data)
        monkeypatch.setattr("app.jobs.scheduler.get_supabase", lambda: mock_sb)

        mock_sb.table.return_value.select.return_value.eq.return_value.is_.return_value.gte.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"kind": "low_stock", "message": "test", "products": {"sku": "X"}}]
        )

        send_calls = []
        def fake_send(to, name, alerts):
            send_calls.append(to)
            if to == "b@b.com":
                raise Exception("Resend API down")
            return True

        monkeypatch.setattr("app.notifications.send_alert_digest", fake_send)

        from app.jobs.scheduler import _job_send_daily_digests
        _job_send_daily_digests()

        assert "a@b.com" in send_calls
        assert "b@b.com" in send_calls
        assert "c@b.com" in send_calls

    def test_skips_opt_out_sellers(self, monkeypatch):
        """Sellers с обеими нотификациями выключенными — skip без запросов alerts."""
        mock_sb = MagicMock()
        sellers_data = [
            {"id": "s1", "email": "a@b.com", "display_name": "A", "telegram_chat_id": None,
             "notify_email": False, "notify_telegram": False},
        ]
        monkeypatch.setattr("app.jobs.scheduler.fetch_all", lambda q: sellers_data)
        monkeypatch.setattr("app.jobs.scheduler.get_supabase", lambda: mock_sb)

        send_calls = []
        monkeypatch.setattr("app.notifications.send_alert_digest",
                            lambda *a, **kw: send_calls.append(a))

        from app.jobs.scheduler import _job_send_daily_digests
        _job_send_daily_digests()

        assert len(send_calls) == 0


class TestSyncConnectionsPagination:
    """БАГ 31: пагинация через fetch_all при ≥1000 connections."""

    def test_uses_fetch_all_not_execute(self, monkeypatch):
        """_job_sync_active_connections использует fetch_all для всех connections."""
        mock_sb = MagicMock()
        fetch_all_called = {"count": 0}

        def fake_fetch_all(query):
            fetch_all_called["count"] += 1
            return []

        monkeypatch.setattr("app.jobs.scheduler.fetch_all", fake_fetch_all)
        monkeypatch.setattr("app.jobs.scheduler.get_supabase", lambda: mock_sb)

        from app.jobs.scheduler import _job_sync_active_connections
        _job_sync_active_connections()

        assert fetch_all_called["count"] == 1


# ============================================================================
# БАГ 89: snapshots retention
# ============================================================================

class TestSnapshotsRetention:
    def test_deletes_old_snapshots_when_present(self, monkeypatch):
        """Если есть snapshots старше 180 дней — DELETE вызван."""
        from app.jobs.scheduler import _job_snapshots_retention

        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.lt.return_value.limit.return_value.execute.return_value = MagicMock(
            count=100, data=[]
        )
        delete_calls = []
        def fake_delete(*a, **kw):
            delete_calls.append(("delete",))
            mock_delete = MagicMock()
            mock_delete.lt.return_value.execute.return_value = MagicMock(data=[])
            return mock_delete

        mock_sb.table.return_value.delete.side_effect = fake_delete

        with patch("app.jobs.scheduler.get_supabase", return_value=mock_sb):
            _job_snapshots_retention()

        assert len(delete_calls) >= 1

    def test_skips_when_nothing_to_delete(self, monkeypatch):
        """Если count=0 — DELETE НЕ вызван, ранний return."""
        from app.jobs.scheduler import _job_snapshots_retention

        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.lt.return_value.limit.return_value.execute.return_value = MagicMock(
            count=0, data=[]
        )
        delete_calls = []
        mock_sb.table.return_value.delete.side_effect = lambda: delete_calls.append("d") or MagicMock()

        with patch("app.jobs.scheduler.get_supabase", return_value=mock_sb):
            _job_snapshots_retention()

        assert len(delete_calls) == 0

    def test_graceful_on_exception(self, monkeypatch):
        """Если БД недоступна — log warning, без crash."""
        from app.jobs.scheduler import _job_snapshots_retention

        mock_sb = MagicMock()
        mock_sb.table.side_effect = Exception("DB unreachable")

        with patch("app.jobs.scheduler.get_supabase", return_value=mock_sb):
            _job_snapshots_retention()


# ============================================================================
# БАГ 90: reset stuck syncing connections
# ============================================================================

class TestResetStuckSyncing:
    def test_resets_stuck_connections(self, monkeypatch):
        """connections в syncing с updated_at > 30 мин назад → status=error."""
        from app.jobs.scheduler import _job_reset_stuck_syncing

        mock_sb = MagicMock()
        stuck_data = [
            {"id": "conn-1", "name": "Ozon", "updated_at": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()},
            {"id": "conn-2", "name": "WB", "updated_at": (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()},
        ]
        mock_sb.table.return_value.select.return_value.eq.return_value.lt.return_value.execute.return_value = MagicMock(
            data=stuck_data
        )
        update_calls = []
        def fake_update(payload):
            update_calls.append(payload)
            mock_u = MagicMock()
            mock_u.eq.return_value.execute.return_value = MagicMock(data=[])
            return mock_u

        mock_sb.table.return_value.update.side_effect = fake_update

        with patch("app.jobs.scheduler.get_supabase", return_value=mock_sb):
            _job_reset_stuck_syncing()

        assert len(update_calls) == 2
        for payload in update_calls:
            assert payload["status"] == "error"
            assert "worker restart" in payload["last_error"].lower()

    def test_no_action_when_no_stuck(self, monkeypatch):
        """Если нет stuck connections — никаких UPDATE."""
        from app.jobs.scheduler import _job_reset_stuck_syncing

        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.lt.return_value.execute.return_value = MagicMock(
            data=[]
        )
        update_calls = []
        mock_sb.table.return_value.update.side_effect = lambda p: update_calls.append(p) or MagicMock()

        with patch("app.jobs.scheduler.get_supabase", return_value=mock_sb):
            _job_reset_stuck_syncing()

        assert len(update_calls) == 0

    def test_individual_update_failure_isolated(self, monkeypatch):
        """Если UPDATE одного connection падает — остальные обновляются."""
        from app.jobs.scheduler import _job_reset_stuck_syncing

        mock_sb = MagicMock()
        stuck_data = [
            {"id": "conn-1", "name": "A", "updated_at": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()},
            {"id": "conn-2", "name": "B", "updated_at": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()},
            {"id": "conn-3", "name": "C", "updated_at": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()},
        ]
        mock_sb.table.return_value.select.return_value.eq.return_value.lt.return_value.execute.return_value = MagicMock(
            data=stuck_data
        )

        update_attempts = []
        def fake_update(payload):
            mock_u = MagicMock()
            def fake_eq(k, v):
                update_attempts.append(v)
                mock_e = MagicMock()
                if v == "conn-2":
                    mock_e.execute.side_effect = Exception("temp DB error")
                else:
                    mock_e.execute.return_value = MagicMock(data=[])
                return mock_e
            mock_u.eq.side_effect = fake_eq
            return mock_u

        mock_sb.table.return_value.update.side_effect = fake_update

        with patch("app.jobs.scheduler.get_supabase", return_value=mock_sb):
            _job_reset_stuck_syncing()

        assert update_attempts == ["conn-1", "conn-2", "conn-3"]
