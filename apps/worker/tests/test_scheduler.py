"""Тесты scheduler.py — БАГ 30/31 пагинация + per-seller try/catch."""
from __future__ import annotations
import os
os.environ["ENABLE_SCHEDULER"] = "false"

from unittest.mock import MagicMock, patch


class TestDailyDigestPerSellerTryCatch:
    """БАГ 30: один упавший email/telegram не должен валить digest для остальных."""

    def test_continues_on_email_failure(self, monkeypatch):
        """Если для одного seller email падает, для других продолжаем."""
        mock_sb = MagicMock()
        # 3 seller'а
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

        # У каждого seller'а есть 1 alert
        mock_sb.table.return_value.select.return_value.eq.return_value.is_.return_value.gte.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"kind": "low_stock", "message": "test", "products": {"sku": "X"}}]
        )

        # s2 → email падает с exception
        send_calls = []
        def fake_send(to, name, alerts):
            send_calls.append(to)
            if to == "b@b.com":
                raise Exception("Resend API down")
            return True

        monkeypatch.setattr("app.notifications.send_alert_digest", fake_send)

        from app.jobs.scheduler import _job_send_daily_digests
        # Должно отработать без exception
        _job_send_daily_digests()

        # Все 3 seller'а получили попытку отправки (s2 упал, но s3 продолжил)
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

        # Никаких отправок не было
        assert len(send_calls) == 0


class TestSyncConnectionsPagination:
    """БАГ 31: пагинация через fetch_all при ≥1000 connections."""

    def test_uses_fetch_all_not_execute(self, monkeypatch):
        """_job_sync_active_connections использует fetch_all для всех connections."""
        mock_sb = MagicMock()
        fetch_all_called = {"count": 0}

        def fake_fetch_all(query):
            fetch_all_called["count"] += 1
            return []  # пустой список — никаких connections нет

        monkeypatch.setattr("app.jobs.scheduler.fetch_all", fake_fetch_all)
        monkeypatch.setattr("app.jobs.scheduler.get_supabase", lambda: mock_sb)

        from app.jobs.scheduler import _job_sync_active_connections
        _job_sync_active_connections()

        # fetch_all должен быть вызван (один раз для connections)
        assert fetch_all_called["count"] == 1
