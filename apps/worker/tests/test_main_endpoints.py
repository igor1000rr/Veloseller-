"""Тесты FastAPI endpoints в app/main.py.

Покрываем:
  - /health smoke
  - require_worker_secret (dev mode + production auth)
  - /ingest/csv
  - /ingest/google-sheet/{id} (404, 400, success)
  - /ingest/ozon, /ingest/wb, /ingest/feed — с mock-ами
  - /jobs/recalc/{seller_id} (синхронный ?sync=true и async режимы), /jobs/recalc-all, /jobs/recalc/{id}/status
  - /telegram/webhook (/start, /start <id>, empty)
"""
from __future__ import annotations
import os
os.environ["ENABLE_SCHEDULER"] = "false"  # не запускаем APScheduler в тестах

from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app, _running_recalcs
from app.schemas import SnapshotInput


client = TestClient(app)


# ============================================================================
# Health
# ============================================================================

class TestHealth:
    def test_returns_ok(self):
        r = client.get("/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"
        assert "ts" in body


# ============================================================================
# Worker secret auth
# ============================================================================

class TestWorkerSecret:
    def test_dev_secret_skips_auth(self, monkeypatch):
        """Dev mode (worker_secret = 'dev-secret-replace-me') пропускает без header."""
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        # Используем /jobs/recalc-all — простой endpoint с auth dependency
        with patch("app.main.recalc_all_sellers", return_value={"sellers": 0}):
            r = client.post("/jobs/recalc-all")
        assert r.status_code == 200

    def test_production_requires_header(self, monkeypatch):
        """Production: без X-Worker-Secret → 401."""
        monkeypatch.setattr("app.main.settings.worker_secret", "real-secret-123")
        r = client.post("/jobs/recalc-all")
        assert r.status_code == 401

    def test_production_accepts_correct_header(self, monkeypatch):
        monkeypatch.setattr("app.main.settings.worker_secret", "real-secret-123")
        with patch("app.main.recalc_all_sellers", return_value={"sellers": 0}):
            r = client.post("/jobs/recalc-all", headers={"X-Worker-Secret": "real-secret-123"})
        assert r.status_code == 200

    def test_production_rejects_wrong_header(self, monkeypatch):
        monkeypatch.setattr("app.main.settings.worker_secret", "real-secret-123")
        r = client.post("/jobs/recalc-all", headers={"X-Worker-Secret": "wrong"})
        assert r.status_code == 401


# ============================================================================
# CSV ingest
# ============================================================================

class TestIngestCsv:
    def test_success(self, monkeypatch):
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        mock_sb = MagicMock()
        mock_sb.table.return_value.upsert.return_value.execute.return_value = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.in_.return_value.execute.return_value = MagicMock(
            data=[{"product_id": "pid-1", "sku": "A1"}]
        )
        mock_sb.table.return_value.insert.return_value.execute.return_value = MagicMock()
        with patch("app.main.get_supabase", return_value=mock_sb):
            r = client.post(
                "/ingest/csv?seller_id=s-1",
                files={"file": ("test.csv", b"sku,stock_quantity,price\nA1,10,100\n", "text/csv")},
            )
        assert r.status_code == 200
        body = r.json()
        assert body["skus"] == 1

    def test_invalid_csv_returns_400(self, monkeypatch):
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        r = client.post(
            "/ingest/csv?seller_id=s-1",
            files={"file": ("test.csv", b"bad,headers\nnope,nope\n", "text/csv")},
        )
        assert r.status_code == 400
        assert "CSV parse error" in r.json()["detail"]


# ============================================================================
# Connection-based ingests
# ============================================================================

def _mock_supabase_for_connection(connection_data: dict | None) -> MagicMock:
    """Mock supabase где select(...).eq().single().execute() возвращает connection_data."""
    mock_sb = MagicMock()
    chain = mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value
    chain.execute.return_value = MagicMock(data=connection_data)
    return mock_sb


class TestIngestGoogleSheet:
    def test_404_when_no_connection(self, monkeypatch):
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        mock_sb = _mock_supabase_for_connection(None)
        with patch("app.main.get_supabase", return_value=mock_sb):
            r = client.post("/ingest/google-sheet/conn-nonexistent")
        assert r.status_code == 404

    def test_400_when_no_sheet_in_config(self, monkeypatch):
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        mock_sb = _mock_supabase_for_connection({
            "id": "conn-1", "seller_id": "s-1", "config": {}
        })
        with patch("app.main.get_supabase", return_value=mock_sb):
            r = client.post("/ingest/google-sheet/conn-1")
        assert r.status_code == 400
        assert "sheet_url" in r.json()["detail"]


class TestIngestOzon:
    def test_400_when_missing_credentials(self, monkeypatch):
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        mock_sb = _mock_supabase_for_connection({
            "id": "conn-2", "seller_id": "s-1",
            "config": {"client_id": "", "api_key": ""}
        })
        with patch("app.main.get_supabase", return_value=mock_sb):
            r = client.post("/ingest/ozon/conn-2")
        assert r.status_code == 400
        assert "client_id" in r.json()["detail"]

    def test_404_when_no_connection(self, monkeypatch):
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        mock_sb = _mock_supabase_for_connection(None)
        with patch("app.main.get_supabase", return_value=mock_sb):
            r = client.post("/ingest/ozon/conn-none")
        assert r.status_code == 404


class TestIngestWb:
    def test_400_when_no_token(self, monkeypatch):
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        mock_sb = _mock_supabase_for_connection({
            "id": "conn-3", "seller_id": "s-1", "config": {}
        })
        with patch("app.main.get_supabase", return_value=mock_sb):
            r = client.post("/ingest/wb/conn-3")
        assert r.status_code == 400
        assert "token" in r.json()["detail"]


class TestIngestFeed:
    def test_400_when_no_url(self, monkeypatch):
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        mock_sb = _mock_supabase_for_connection({
            "id": "conn-4", "seller_id": "s-1", "config": {}
        })
        with patch("app.main.get_supabase", return_value=mock_sb):
            r = client.post("/ingest/feed/conn-4")
        assert r.status_code == 400
        assert "feed_url" in r.json()["detail"]


# ============================================================================
# Recalc jobs
# ============================================================================

class TestRecalcJobs:
    def setup_method(self):
        # Очищаем in-memory state между тестами
        _running_recalcs.clear()

    def test_recalc_seller_sync_returns_result(self, monkeypatch):
        """С ?sync=true endpoint работает синхронно и возвращает результат расчёта."""
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        mock_result = {"products": 5, "metrics_written": 5, "periods": []}
        with patch("app.main.recalc_seller_all_periods", return_value=mock_result) as fn:
            r = client.post("/jobs/recalc/seller-uuid-123?sync=true")
        assert r.status_code == 200
        assert r.json() == mock_result
        fn.assert_called_once_with("seller-uuid-123")

    def test_recalc_seller_async_returns_started(self, monkeypatch):
        """Без sync=true endpoint работает в background и возвращает status=running."""
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        mock_result = {"products": 5, "metrics_written": 5}
        with patch("app.main.recalc_seller_all_periods", return_value=mock_result):
            r = client.post("/jobs/recalc/seller-uuid-456")
        assert r.status_code == 200
        body = r.json()
        assert body["started"] is True
        assert body["status"] == "running"
        assert "started_at" in body
        # С TestClient FastAPI выполняет background tasks после возврата response,
        # поэтому к этому моменту _running_recalcs должен содержать запись
        assert "seller-uuid-456" in _running_recalcs

    def test_recalc_seller_dedup_when_running(self, monkeypatch):
        """Если уже идёт recalc для селлера, второй запрос не запускает второй."""
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        _running_recalcs["seller-busy"] = {
            "started_at": "2026-05-19T09:00:00Z",
            "status": "running",
            "result": None,
            "error": None,
        }
        with patch("app.main.recalc_seller_all_periods") as fn:
            r = client.post("/jobs/recalc/seller-busy")
        assert r.status_code == 200
        body = r.json()
        assert body["started"] is False
        assert body["status"] == "running"
        # Реальный recalc не был вызван
        fn.assert_not_called()

    def test_recalc_status_idle(self, monkeypatch):
        """Status endpoint возвращает idle если ничего не запускалось."""
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        r = client.get("/jobs/recalc/some-unknown-seller/status")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "idle"

    def test_recalc_status_returns_running_state(self, monkeypatch):
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        _running_recalcs["seller-running"] = {
            "started_at": "2026-05-19T09:00:00Z",
            "status": "running",
            "result": None,
            "error": None,
        }
        r = client.get("/jobs/recalc/seller-running/status")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "running"
        assert body["started_at"] == "2026-05-19T09:00:00Z"

    def test_recalc_all(self, monkeypatch):
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        mock_result = {"sellers": 3, "metrics_written": 30}
        with patch("app.main.recalc_all_sellers", return_value=mock_result):
            r = client.post("/jobs/recalc-all")
        assert r.status_code == 200
        assert r.json() == mock_result


# ============================================================================
# Telegram webhook
# ============================================================================

class TestTelegramWebhook:
    def test_empty_body_returns_ok_false(self):
        # Передаём невалидный JSON в content body — endpoint должен вернуть ok:False
        r = client.post("/telegram/webhook", content=b"not-json")
        assert r.status_code == 200
        assert r.json() == {"ok": False}

    def test_no_message_returns_ok(self):
        r = client.post("/telegram/webhook", json={"update_id": 1})
        assert r.status_code == 200
        assert r.json() == {"ok": True}

    def test_no_chat_id_returns_ok(self):
        r = client.post("/telegram/webhook", json={
            "message": {"text": "hi"}  # нет chat.id
        })
        assert r.status_code == 200
        assert r.json() == {"ok": True}

    def test_start_without_seller_id_shows_help(self):
        """/start без аргумента — показываем help message."""
        with patch("app.telegram.send_message", return_value=True) as send:
            r = client.post("/telegram/webhook", json={
                "message": {"text": "/start", "chat": {"id": 555}}
            })
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["linked"] is False
        send.assert_called_once()
        # В сообщении упоминается Veloseller
        call_args = send.call_args[0]
        assert "Veloseller" in call_args[1]

    def test_start_with_seller_id_links_account(self):
        """/start <seller_id> — линкует chat_id к sellers.telegram_chat_id."""
        mock_sb = MagicMock()
        mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[{"id": "seller-uuid-1", "telegram_chat_id": "777"}]
        )
        with patch("app.main.get_supabase", return_value=mock_sb), \
             patch("app.telegram.send_message", return_value=True) as send:
            r = client.post("/telegram/webhook", json={
                "message": {"text": "/start seller-uuid-1", "chat": {"id": 777}}
            })
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["linked"] is True
        # Проверяем что send_message был вызван с success message
        send.assert_called_once()
        msg = send.call_args[0][1]
        assert "подключ" in msg.lower()

    def test_unknown_command_returns_ok(self):
        """Любая команда кроме /start — ok: True без действий."""
        r = client.post("/telegram/webhook", json={
            "message": {"text": "/random", "chat": {"id": 1}}
        })
        assert r.status_code == 200
        assert r.json() == {"ok": True}

    def test_edited_message_is_processed(self):
        """edited_message тоже обрабатывается (не только message)."""
        r = client.post("/telegram/webhook", json={
            "edited_message": {"text": "hello", "chat": {"id": 1}}
        })
        assert r.status_code == 200
        assert r.json() == {"ok": True}
