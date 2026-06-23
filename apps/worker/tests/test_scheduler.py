"""Тесты scheduler.py — БАГ 30/31 пагинация + per-seller try/catch + БАГ 89/90.

Этап 2 «алерты → отчёты»: удалён `_job_send_daily_digests`, добавлен
`_job_daily_reports` который вызывает `dispatch_daily_reports()` из reports.py.
Старые тесты класса `TestDailyDigestPerSellerTryCatch` удалены, новые
— ниже в `TestDailyReports`.
"""
from __future__ import annotations
import os
os.environ["ENABLE_SCHEDULER"] = "false"

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch


class TestCronSyncFailureNotifies:
    """P1-фикс: крон-путь при ошибке синка ДЕЛЕГИРУЕТ в общий
    ingest_persist._mark_connection_synced (инкремент failure_count + авто-пауза
    после порога + письмо/Telegram), а не пишет молча status='error'.

    Раньше авто-пауза и нотификации работали ТОЛЬКО на ручном HTTP-пути (main.py),
    а ночной sync-active / retry-transient тихо помечали error без счётчика —
    склад с протухшим токеном устаревал без единого алерта юзеру.
    """

    def test_mark_connection_error_delegates_to_shared(self, monkeypatch):
        from app.jobs import scheduler

        calls = []

        def fake_synced(sb, connection_id, error=None):
            calls.append((connection_id, error))

        monkeypatch.setattr("app.ingest_persist._mark_connection_synced", fake_synced)

        mock_sb = MagicMock()
        err_text = "401 unauthorized " + "x" * 600
        scheduler._mark_connection_error(mock_sb, {"id": "conn-1"}, RuntimeError(err_text))

        assert len(calls) == 1
        assert calls[0][0] == "conn-1"
        # ошибка проброшена и обрезана до 500 символов
        assert calls[0][1].startswith("401 unauthorized")
        assert len(calls[0][1]) == 500
        # критично: НЕ обходит общий путь прямым минимальным update'ом
        mock_sb.table.assert_not_called()

    def test_mark_connection_error_swallows_exceptions(self, monkeypatch):
        """Если общий путь упал — крон-цикл не падает (только лог)."""
        from app.jobs import scheduler

        def boom(sb, connection_id, error=None):
            raise RuntimeError("notify dispatch failed")

        monkeypatch.setattr("app.ingest_persist._mark_connection_synced", boom)
        # не должно выбросить наружу
        scheduler._mark_connection_error(MagicMock(), {"id": "c"}, Exception("sync x"))


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
# Этап 2 «алерты → отчёты»: новый универсальный cron daily-reports.
# ============================================================================

class TestDailyReports:
    """`_job_daily_reports` — обёртка над dispatch_daily_reports.

    Сам dispatch_daily_reports тестируется отдельно в test_reports.py.
    """

    def test_job_calls_dispatch(self, monkeypatch):
        """Job делегирует в reports.dispatch_daily_reports()."""
        calls = {"n": 0}

        def fake_dispatch():
            calls["n"] += 1

        monkeypatch.setattr("app.jobs.reports.dispatch_daily_reports", fake_dispatch)

        from app.jobs.scheduler import _job_daily_reports
        _job_daily_reports()

        assert calls["n"] == 1

    def test_job_swallows_exceptions(self, monkeypatch):
        """Если dispatch бросает — cron не падает (только лог).

        Это важно для prod-стабильности: один битый seller не должен ронять
        весь scheduler.
        """
        def boom():
            raise RuntimeError("DB down")

        monkeypatch.setattr("app.jobs.reports.dispatch_daily_reports", boom)

        # Не должно выбросить исключение наружу
        from app.jobs.scheduler import _job_daily_reports
        _job_daily_reports()


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
