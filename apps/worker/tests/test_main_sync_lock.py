"""Тесты main.py — БАГ 87 (atomic sync lock) + БАГ 85 (BG ingest endpoints).

Покрываем:
  - _try_acquire_sync_lock: True если status НЕ syncing
  - _try_acquire_sync_lock: False если status уже syncing
  - _try_acquire_sync_lock: graceful fallback при exception → False
  - ingest_ozon: BG task + double-click защита
"""
from __future__ import annotations
import os
os.environ["ENABLE_SCHEDULER"] = "false"

from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


class TestTryAcquireSyncLock:
    def test_acquires_lock_when_not_syncing(self):
        """Если connection не syncing — UPDATE возвращает 1 строку → True."""
        from app.main import _try_acquire_sync_lock

        mock_sb = MagicMock()
        mock_sb.table.return_value.update.return_value.eq.return_value.neq.return_value.execute.return_value = MagicMock(
            data=[{"id": "conn-1", "status": "syncing"}]
        )

        assert _try_acquire_sync_lock(mock_sb, "conn-1") is True

    def test_rejects_lock_when_already_syncing(self):
        """Если status уже syncing — UPDATE WHERE neq matches 0 rows → False."""
        from app.main import _try_acquire_sync_lock

        mock_sb = MagicMock()
        mock_sb.table.return_value.update.return_value.eq.return_value.neq.return_value.execute.return_value = MagicMock(
            data=[]
        )

        assert _try_acquire_sync_lock(mock_sb, "conn-1") is False

    def test_graceful_fallback_on_db_exception(self):
        """Exception при DB-вызове → False, без поломки."""
        from app.main import _try_acquire_sync_lock

        mock_sb = MagicMock()
        mock_sb.table.return_value.update.side_effect = Exception("DB connection error")

        assert _try_acquire_sync_lock(mock_sb, "conn-1") is False


class TestIngestOzonSyncLock:
    """БАГ 87: двойной клик на одной connection не должен запускать double-BG."""

    def test_first_call_starts_bg(self, monkeypatch):
        """Первый запрос → starts=True."""
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
            data={"id": "conn-1", "seller_id": "s-1",
                  "config": {"client_id": "cid", "api_key": "akey"}}
        )
        mock_sb.table.return_value.update.return_value.eq.return_value.neq.return_value.execute.return_value = MagicMock(
            data=[{"id": "conn-1"}]
        )

        with patch("app.main.get_supabase", return_value=mock_sb), \
             patch("app.crypto.decrypt_if_encrypted", side_effect=lambda x: x):
            r = client.post("/ingest/ozon/conn-1")

        assert r.status_code == 200
        body = r.json()
        assert body["started"] is True

    def test_second_call_skipped_when_already_syncing(self, monkeypatch):
        """Второй запрос при status='syncing' → started=False, без double-BG."""
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
            data={"id": "conn-1", "seller_id": "s-1",
                  "config": {"client_id": "cid", "api_key": "akey"}}
        )
        mock_sb.table.return_value.update.return_value.eq.return_value.neq.return_value.execute.return_value = MagicMock(
            data=[]
        )

        with patch("app.main.get_supabase", return_value=mock_sb), \
             patch("app.crypto.decrypt_if_encrypted", side_effect=lambda x: x):
            r = client.post("/ingest/ozon/conn-1")

        assert r.status_code == 200
        body = r.json()
        assert body["started"] is False
        assert body["status"] == "running"

    def test_validation_400_before_lock_attempt(self, monkeypatch):
        """Если config невалидный — 400 БЕЗ попытки взять lock."""
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
            data={"id": "conn-1", "seller_id": "s-1", "config": {}}
        )

        with patch("app.main.get_supabase", return_value=mock_sb):
            r = client.post("/ingest/ozon/conn-1")

        assert r.status_code == 400
        update_calls = [c for c in mock_sb.table.return_value.mock_calls
                        if "update" in str(c)]
        assert len(update_calls) == 0
