"""Тесты FastAPI endpoints в app/main.py.

Покрываем:
  - /health smoke
  - require_worker_secret (dev mode + production auth)
  - /ingest/csv (success, invalid CSV, БАГ 96 size limit, БАГ 97 UUID validation)
  - /ingest/google-sheet/{id} (404, 400, success)
  - /ingest/ozon, /ingest/wb, /ingest/feed — с mock-ами
  - /jobs/recalc/{seller_id} (БАГ 95: DB-based lock через mock recalc_lock)
  - /jobs/recalc-all, /jobs/recalc/{id}/status
  - /telegram/webhook (/start, /start <uuid>, empty, БАГ 52 — secret token)
"""
from __future__ import annotations
import os
os.environ["ENABLE_SCHEDULER"] = "false"

from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas import SnapshotInput


client = TestClient(app)

# Валидный UUID для тестов (БАГ 97 — теперь /ingest/csv требует UUID)
VALID_UUID = "e113ebfb-3409-4cca-b0ab-0a7d965f4cba"
SECOND_UUID = "11111111-2222-3333-4444-555555555555"


class TestHealth:
    def test_returns_ok(self):
        r = client.get("/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"
        assert "ts" in body


class TestWorkerSecret:
    def test_dev_secret_skips_auth(self, monkeypatch):
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        with patch("app.main.recalc_all_sellers", return_value={"sellers": 0}):
            r = client.post("/jobs/recalc-all")
        assert r.status_code == 200

    def test_production_requires_header(self, monkeypatch):
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


class TestIngestCsv:
    def test_success(self, monkeypatch):
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        mock_sb = MagicMock()
        mock_sb.table.return_value.upsert.return_value.execute.return_value = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.in_.return_value.execute.return_value = MagicMock(
            data=[{"product_id": "pid-1", "sku": "A1"}]
        )
        mock_sb.table.return_value.insert.return_value.execute.return_value = MagicMock()
        with patch("app.main.get_supabase", return_value=mock_sb), \
             patch("app.main.fetch_all", return_value=[]):
            r = client.post(
                f"/ingest/csv?seller_id={VALID_UUID}",
                files={"file": ("test.csv", b"sku,stock_quantity,price\nA1,10,100\n", "text/csv")},
            )
        assert r.status_code == 200
        body = r.json()
        assert body["skus"] == 1

    def test_invalid_csv_returns_400(self, monkeypatch):
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        r = client.post(
            f"/ingest/csv?seller_id={VALID_UUID}",
            files={"file": ("test.csv", b"bad,headers\nnope,nope\n", "text/csv")},
        )
        assert r.status_code == 400
        assert "CSV parse error" in r.json()["detail"]


class TestIngestCsvValidation:
    """БАГ 96 + 97: UUID validation + размер файла."""

    def test_rejects_non_uuid_seller_id(self, monkeypatch):
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        mock_sb = MagicMock()
        with patch("app.main.get_supabase", return_value=mock_sb):
            r = client.post(
                "/ingest/csv?seller_id=not-a-uuid",
                files={"file": ("test.csv", b"sku,stock_quantity,price\nA1,10,100\n", "text/csv")},
            )
        assert r.status_code == 400
        assert "UUID" in r.json()["detail"]
        mock_sb.table.assert_not_called()

    def test_rejects_sql_injection_in_seller_id(self, monkeypatch):
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        mock_sb = MagicMock()
        with patch("app.main.get_supabase", return_value=mock_sb):
            r = client.post(
                "/ingest/csv?seller_id='; DROP TABLE sellers;--",
                files={"file": ("test.csv", b"sku,stock_quantity,price\nA1,10,100\n", "text/csv")},
            )
        assert r.status_code == 400
        mock_sb.table.assert_not_called()

    def test_rejects_oversized_file_with_lowered_limit(self, monkeypatch):
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        monkeypatch.setattr("app.main._CSV_MAX_SIZE_BYTES", 50)
        content = b"sku,stock_quantity,price\n" + b"A1,10,100\n" * 10
        assert len(content) > 50
        r = client.post(
            f"/ingest/csv?seller_id={VALID_UUID}",
            files={"file": ("big.csv", content, "text/csv")},
        )
        assert r.status_code == 413
        detail = r.json()["detail"].lower()
        assert "слишком" in detail or "max" in detail or "большой" in detail

    def test_accepts_normal_size_file(self, monkeypatch):
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        mock_sb = MagicMock()
        mock_sb.table.return_value.upsert.return_value.execute.return_value = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.in_.return_value.execute.return_value = MagicMock(
            data=[{"product_id": "pid-1", "sku": "A1"}]
        )
        mock_sb.table.return_value.insert.return_value.execute.return_value = MagicMock()
        small_content = b"sku,stock_quantity,price\nA1,10,100\n"
        with patch("app.main.get_supabase", return_value=mock_sb), \
             patch("app.main.fetch_all", return_value=[]):
            r = client.post(
                f"/ingest/csv?seller_id={VALID_UUID}",
                files={"file": ("small.csv", small_content, "text/csv")},
            )
        assert r.status_code == 200


def _mock_supabase_for_connection(connection_data):
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


class TestRecalcJobs:
    """БАГ 95: lock через recalc_lock module, не in-memory dict."""

    def test_recalc_seller_sync_returns_result(self, monkeypatch):
        """sync режим не использует lock — для dev/тестов."""
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        mock_result = {"products": 5, "metrics_written": 5, "periods": []}
        with patch("app.main.recalc_seller_all_periods", return_value=mock_result) as fn:
            r = client.post(f"/jobs/recalc/{VALID_UUID}?sync=true")
        assert r.status_code == 200
        assert r.json() == mock_result
        fn.assert_called_once_with(VALID_UUID)

    def test_recalc_seller_async_acquires_lock_and_returns_started(self, monkeypatch):
        """async: try_acquire_recalc_lock=True → запускается task."""
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        mock_sb = MagicMock()
        with patch("app.main.get_supabase", return_value=mock_sb), \
             patch("app.main.try_acquire_recalc_lock", return_value=True) as lock_fn:
            r = client.post(f"/jobs/recalc/{VALID_UUID}")
        assert r.status_code == 200
        body = r.json()
        assert body["started"] is True
        assert body["status"] == "running"
        assert "started_at" in body
        # lock acquire вызван
        lock_fn.assert_called_once()
        # Аргументы: первым sb, вторым seller_id
        call_args = lock_fn.call_args[0]
        assert call_args[1] == VALID_UUID

    def test_recalc_seller_dedup_when_lock_already_held(self, monkeypatch):
        """БАГ 95: try_acquire_recalc_lock=False → возвращаем started=False."""
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        mock_sb = MagicMock()
        existing_state = {
            "status": "running",
            "started_at": "2026-05-19T09:00:00+00:00",
            "worker_id": "host1:1234",
        }
        with patch("app.main.get_supabase", return_value=mock_sb), \
             patch("app.main.try_acquire_recalc_lock", return_value=False), \
             patch("app.main.get_recalc_state", return_value=existing_state):
            r = client.post(f"/jobs/recalc/{VALID_UUID}")
        assert r.status_code == 200
        body = r.json()
        assert body["started"] is False
        assert body["status"] == "running"
        assert body["started_at"] == "2026-05-19T09:00:00+00:00"

    def test_recalc_status_idle(self, monkeypatch):
        """get_recalc_state=None → status='idle'."""
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        mock_sb = MagicMock()
        with patch("app.main.get_supabase", return_value=mock_sb), \
             patch("app.main.get_recalc_state", return_value=None):
            r = client.get(f"/jobs/recalc/{VALID_UUID}/status")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "idle"
        assert body["started_at"] is None

    def test_recalc_status_returns_running_state(self, monkeypatch):
        """DB state маппится на response с error_text → error."""
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        mock_sb = MagicMock()
        db_state = {
            "seller_id": VALID_UUID,
            "status": "running",
            "started_at": "2026-05-19T09:00:00+00:00",
            "finished_at": None,
            "result": None,
            "error_text": None,
            "progress": {"phase": "loading"},
        }
        with patch("app.main.get_supabase", return_value=mock_sb), \
             patch("app.main.get_recalc_state", return_value=db_state):
            r = client.get(f"/jobs/recalc/{VALID_UUID}/status")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "running"
        assert body["started_at"] == "2026-05-19T09:00:00+00:00"
        # БАГ 95: error_text в DB → error в ответе
        assert body["error"] is None
        assert body["progress"] == {"phase": "loading"}

    def test_recalc_status_returns_error_text_as_error(self, monkeypatch):
        """DB.error_text → response.error для UI совместимости."""
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        mock_sb = MagicMock()
        db_state = {
            "seller_id": VALID_UUID,
            "status": "error",
            "started_at": "2026-05-19T09:00:00+00:00",
            "finished_at": "2026-05-19T09:05:00+00:00",
            "result": None,
            "error_text": "OOM killed",
            "progress": None,
        }
        with patch("app.main.get_supabase", return_value=mock_sb), \
             patch("app.main.get_recalc_state", return_value=db_state):
            r = client.get(f"/jobs/recalc/{VALID_UUID}/status")
        body = r.json()
        assert body["status"] == "error"
        assert body["error"] == "OOM killed"

    def test_recalc_all(self, monkeypatch):
        monkeypatch.setattr("app.main.settings.worker_secret", "dev-secret-replace-me")
        mock_result = {"sellers": 3, "metrics_written": 30}
        with patch("app.main.recalc_all_sellers", return_value=mock_result):
            r = client.post("/jobs/recalc-all")
        assert r.status_code == 200
        assert r.json() == mock_result


# ============================================================================
# Telegram webhook (БАГ 52)
# ============================================================================


class TestTelegramWebhook:
    def setup_method(self):
        for var in ("TELEGRAM_WEBHOOK_SECRET", "ENV"):
            os.environ.pop(var, None)

    def test_empty_body_returns_ok_false(self):
        r = client.post("/telegram/webhook", content=b"not-json")
        assert r.status_code == 200
        assert r.json() == {"ok": False}

    def test_no_message_returns_ok(self):
        r = client.post("/telegram/webhook", json={"update_id": 1})
        assert r.status_code == 200
        assert r.json() == {"ok": True}

    def test_no_chat_id_returns_ok(self):
        r = client.post("/telegram/webhook", json={
            "message": {"text": "hi"}
        })
        assert r.status_code == 200
        assert r.json() == {"ok": True}

    def test_start_without_seller_id_shows_help(self):
        with patch("app.telegram.send_message", return_value=True) as send:
            r = client.post("/telegram/webhook", json={
                "message": {"text": "/start", "chat": {"id": 555}}
            })
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["linked"] is False
        send.assert_called_once()
        call_args = send.call_args[0]
        assert "Veloseller" in call_args[1]

    def test_start_with_valid_uuid_links_account(self):
        mock_sb = MagicMock()
        mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[{"id": VALID_UUID, "telegram_chat_id": "777"}]
        )
        with patch("app.main.get_supabase", return_value=mock_sb), \
             patch("app.telegram.send_message", return_value=True) as send:
            r = client.post("/telegram/webhook", json={
                "message": {"text": f"/start {VALID_UUID}", "chat": {"id": 777}}
            })
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["linked"] is True
        send.assert_called_once()
        msg = send.call_args[0][1]
        assert "подключ" in msg.lower()

    def test_start_with_invalid_uuid_shows_help(self):
        mock_sb = MagicMock()
        with patch("app.main.get_supabase", return_value=mock_sb), \
             patch("app.telegram.send_message", return_value=True) as send:
            r = client.post("/telegram/webhook", json={
                "message": {"text": "/start not-a-uuid; DROP TABLE sellers;--", "chat": {"id": 666}}
            })
        assert r.status_code == 200
        body = r.json()
        assert body["linked"] is False
        mock_sb.table.assert_not_called()

    def test_unknown_command_returns_ok(self):
        r = client.post("/telegram/webhook", json={
            "message": {"text": "/random", "chat": {"id": 1}}
        })
        assert r.status_code == 200
        assert r.json() == {"ok": True}

    def test_edited_message_is_processed(self):
        r = client.post("/telegram/webhook", json={
            "edited_message": {"text": "hello", "chat": {"id": 1}}
        })
        assert r.status_code == 200
        assert r.json() == {"ok": True}

    def test_secret_token_required_when_env_set(self, monkeypatch):
        monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", "my-secret")
        r = client.post("/telegram/webhook", json={"update_id": 1})
        assert r.status_code == 403

    def test_secret_token_accepted_when_correct(self, monkeypatch):
        monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", "my-secret")
        r = client.post(
            "/telegram/webhook",
            json={"update_id": 1},
            headers={"X-Telegram-Bot-Api-Secret-Token": "my-secret"},
        )
        assert r.status_code == 200

    def test_secret_token_rejected_when_wrong(self, monkeypatch):
        monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", "my-secret")
        r = client.post(
            "/telegram/webhook",
            json={"update_id": 1},
            headers={"X-Telegram-Bot-Api-Secret-Token": "wrong"},
        )
        assert r.status_code == 403

    def test_production_without_secret_returns_500(self, monkeypatch):
        monkeypatch.setenv("ENV", "production")
        monkeypatch.delenv("TELEGRAM_WEBHOOK_SECRET", raising=False)
        r = client.post("/telegram/webhook", json={"update_id": 1})
        assert r.status_code == 500
