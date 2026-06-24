"""Тесты main.py — БАГ 85 BG sync executors + _mark_connection_synced.

Покрываем:
  - _mark_connection_synced: устанавливает active/error status
  - _mark_connection_synced: записывает last_error при ошибке
  - _run_ozon_sync_bg: успешный sync → mark synced + persist snapshots
  - _run_ozon_sync_bg: исключение в ozon.fetch_snapshots → mark error
  - _run_wb_sync_bg: то же для WB
"""
from __future__ import annotations
import os
os.environ["ENABLE_SCHEDULER"] = "false"

from unittest.mock import MagicMock, patch


class TestMarkConnectionSynced:
    """Без _mark_connection_synced UI polling вечно покажет 'Идёт синхронизация…'."""

    def test_marks_active_on_success(self):
        """error=None → status='active', last_error=None."""
        from app.main import _mark_connection_synced

        mock_sb = MagicMock()
        update_payloads = []
        mock_table = mock_sb.table.return_value
        mock_update = MagicMock()
        mock_table.update.side_effect = lambda p: update_payloads.append(p) or mock_update
        mock_update.eq.return_value.execute.return_value = MagicMock(data=[])

        _mark_connection_synced(mock_sb, "conn-1")

        assert len(update_payloads) == 1
        payload = update_payloads[0]
        assert payload["status"] == "active"
        assert payload["last_error"] is None
        assert "last_sync_at" in payload

    def test_marks_error_with_message(self):
        """error='boom' → status='error', last_error='boom'."""
        from app.main import _mark_connection_synced

        mock_sb = MagicMock()
        update_payloads = []
        mock_sb.table.return_value.update.side_effect = lambda p: update_payloads.append(p) or MagicMock(
            eq=MagicMock(return_value=MagicMock(execute=MagicMock(return_value=MagicMock(data=[]))))
        )

        _mark_connection_synced(mock_sb, "conn-1", error="API rate limit")

        payload = update_payloads[0]
        assert payload["status"] == "error"
        assert payload["last_error"] == "API rate limit"


class TestAutoPauseOnlyOnPersistent:
    """Фикс 24.06.2026: транзиентные ошибки (429-лимит WB Statistics, 5xx, сеть)
    НЕ паузят склад — из paused его достаёт лишь РУЧНОЕ включение, тогда как
    'error' сам поднимается джобом retry-transient вне пика. Стойкие ошибки
    (токен/права/лимит тарифа) по-прежнему паузят после порога.
    """

    @staticmethod
    def _mark(error, cur_failures):
        from app import ingest_persist

        sb = MagicMock()
        sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
            data={"failure_count": cur_failures}
        )
        payloads = []

        def fake_update(p):
            payloads.append(p)
            chain = MagicMock()
            chain.eq.return_value.execute.return_value = MagicMock(data=[])
            return chain

        sb.table.return_value.update.side_effect = fake_update

        notif = []
        with patch(
            "app.ingest_persist._send_sync_error_notifications",
            side_effect=lambda *a, **k: notif.append(a),
        ):
            ingest_persist._mark_connection_synced(sb, "c", error=error)
        return payloads[0], notif

    def test_transient_429_at_threshold_stays_error(self):
        """failure_count достигает порога, но 429 транзиентен → 'error', не 'paused'."""
        payload, notif = self._mark("Client error '429 Too Many Requests'", cur_failures=2)
        assert payload["failure_count"] == 3
        assert payload["status"] == "error"
        # транзиент не спамим пер-фейл уведомлениями (саморазрешается ретраем)
        assert notif == []

    def test_persistent_error_at_threshold_pauses(self):
        """Стойкая ошибка (битый токен) на пороге → 'paused' + уведомление."""
        payload, notif = self._mark("401 Unauthorized: invalid token", cur_failures=2)
        assert payload["failure_count"] == 3
        assert payload["status"] == "paused"
        assert len(notif) == 1

    def test_persistent_below_threshold_is_error_and_notifies(self):
        payload, notif = self._mark("403 Forbidden", cur_failures=0)
        assert payload["failure_count"] == 1
        assert payload["status"] == "error"
        assert len(notif) == 1

    def test_plan_limit_is_persistent_and_pauses(self):
        """Ozon P0001 «SKU limit reached» — стойкая (не транзиент) → паузит,
        а не ретраится вечно."""
        payload, _ = self._mark(
            "SKU limit reached: plan allows up to 2000 SKUs (current: 3354).", cur_failures=2
        )
        assert payload["status"] == "paused"


class TestIsTransientSyncError:
    def test_transient_markers(self):
        from app.ingest_persist import is_transient_sync_error

        assert is_transient_sync_error("Client error '429 Too Many Requests'")
        assert is_transient_sync_error("503 Service Unavailable")
        assert is_transient_sync_error("502 Bad Gateway")
        assert is_transient_sync_error("Read timeout")

    def test_persistent_and_empty_not_transient(self):
        from app.ingest_persist import is_transient_sync_error

        assert not is_transient_sync_error("401 Unauthorized")
        assert not is_transient_sync_error("SKU limit reached: plan allows up to 2000")
        assert not is_transient_sync_error(None)
        assert not is_transient_sync_error("")


class TestRunOzonSyncBg:
    """БАГ 85: BG executor должен обрабатывать ошибки и НИКОГДА не бросать."""

    def test_success_marks_synced_and_persists(self):
        """Успешный fetch → snapshots сохранены, connection помечена active."""
        from app.main import _run_ozon_sync_bg

        snapshots_fixture = [MagicMock() for _ in range(5)]
        mark_calls = []
        persist_calls = []

        def fake_persist(seller_id, conn_id, source_type, snaps):
            persist_calls.append((seller_id, conn_id, len(snaps)))
            return len(snaps)

        def fake_mark(sb, conn_id, error=None):
            mark_calls.append((conn_id, error))

        with patch("app.main.get_supabase", return_value=MagicMock()), \
             patch("app.main.ozon.fetch_snapshots", return_value=snapshots_fixture), \
             patch("app.main._persist_snapshots", side_effect=fake_persist), \
             patch("app.main._mark_connection_synced", side_effect=fake_mark):
            _run_ozon_sync_bg("conn-1", "seller-1", "cid", "akey")

        # Persist был вызван с 5 snapshots
        assert persist_calls == [("seller-1", "conn-1", 5)]
        # Mark — без error
        assert mark_calls == [("conn-1", None)]

    def test_exception_in_fetch_marks_error(self):
        """Если ozon.fetch_snapshots бросает — connection помечена error, БЕЗ rethrow."""
        from app.main import _run_ozon_sync_bg

        mark_calls = []
        def fake_mark(sb, conn_id, error=None):
            mark_calls.append((conn_id, error))

        with patch("app.main.get_supabase", return_value=MagicMock()), \
             patch("app.main.ozon.fetch_snapshots", side_effect=Exception("Ozon API 500")), \
             patch("app.main._mark_connection_synced", side_effect=fake_mark):
            # Не должно бросать — BG task проглатывает exception
            _run_ozon_sync_bg("conn-1", "seller-1", "cid", "akey")

        assert len(mark_calls) == 1
        conn_id, error = mark_calls[0]
        assert conn_id == "conn-1"
        assert "Ozon API 500" in error

    def test_exception_in_persist_marks_error(self):
        """Если _persist_snapshots падает — тоже помечаем error."""
        from app.main import _run_ozon_sync_bg

        mark_calls = []
        def fake_mark(sb, conn_id, error=None):
            mark_calls.append((conn_id, error))

        with patch("app.main.get_supabase", return_value=MagicMock()), \
             patch("app.main.ozon.fetch_snapshots", return_value=[MagicMock()]), \
             patch("app.main._persist_snapshots", side_effect=Exception("Supabase down")), \
             patch("app.main._mark_connection_synced", side_effect=fake_mark):
            _run_ozon_sync_bg("conn-1", "seller-1", "cid", "akey")

        assert len(mark_calls) == 1
        conn_id, error = mark_calls[0]
        assert conn_id == "conn-1"
        assert "Supabase down" in error


class TestRunWbSyncBg:
    """БАГ 85: тот же контракт для WB BG executor."""

    def test_success_marks_synced(self):
        from app.main import _run_wb_sync_bg

        mark_calls = []
        def fake_mark(sb, conn_id, error=None):
            mark_calls.append((conn_id, error))

        with patch("app.main.get_supabase", return_value=MagicMock()), \
             patch("app.main.wildberries.fetch_snapshots", return_value=[MagicMock()]), \
             patch("app.main._persist_snapshots", return_value=1), \
             patch("app.main._mark_connection_synced", side_effect=fake_mark):
            _run_wb_sync_bg("conn-1", "seller-1", "token")

        assert mark_calls == [("conn-1", None)]

    def test_exception_marks_error(self):
        from app.main import _run_wb_sync_bg

        mark_calls = []
        def fake_mark(sb, conn_id, error=None):
            mark_calls.append((conn_id, error))

        with patch("app.main.get_supabase", return_value=MagicMock()), \
             patch("app.main.wildberries.fetch_snapshots", side_effect=Exception("WB 429")), \
             patch("app.main._mark_connection_synced", side_effect=fake_mark):
            _run_wb_sync_bg("conn-1", "seller-1", "token")

        assert len(mark_calls) == 1
        assert "WB 429" in mark_calls[0][1]
