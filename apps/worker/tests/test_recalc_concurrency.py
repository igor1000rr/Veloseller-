"""Тест на БАГ 50 — recalc_all_sellers skip при concurrent manual recalc."""
from __future__ import annotations
import os
os.environ["ENABLE_SCHEDULER"] = "false"

from unittest.mock import MagicMock, patch


class TestRecalcAllConcurrencyLock:
    """БАГ 50: cron skip sellers с активным manual recalc."""

    def setup_method(self):
        # Очищаем _running_recalcs перед каждым тестом
        from app.main import _running_recalcs
        _running_recalcs.clear()

    def teardown_method(self):
        from app.main import _running_recalcs
        _running_recalcs.clear()

    def test_skips_sellers_with_running_status(self, monkeypatch):
        """Sellers с _running_recalcs[seller_id].status='running' пропускаются."""
        from app.main import _running_recalcs
        _running_recalcs["seller-busy"] = {
            "status": "running",
            "started_at": "2026-05-20T00:00:00Z",
        }

        # Мокаем DB — 2 seller'а: busy и free
        mock_sb = MagicMock()
        monkeypatch.setattr("app.jobs.recalc.fetch_all",
                            lambda q: [{"id": "seller-busy"}, {"id": "seller-free"}])
        monkeypatch.setattr("app.jobs.recalc.get_supabase", lambda: mock_sb)

        # Мокаем recalc_seller_all_periods
        called_for = []
        def fake_recalc(sid, progress=None):
            called_for.append(sid)
            return {"products": 0, "metrics_written": 0, "alerts_written": 0,
                    "store_metrics_written": 0}
        monkeypatch.setattr("app.jobs.recalc.recalc_seller_all_periods", fake_recalc)

        from app.jobs.recalc import recalc_all_sellers
        result = recalc_all_sellers()

        # seller-busy пропущен, seller-free обработан
        assert "seller-free" in called_for
        assert "seller-busy" not in called_for
        assert result["sellers"] == 1
        assert result["skipped_concurrent"] == 1

    def test_processes_done_status_sellers(self, monkeypatch):
        """Sellers с done статусом НЕ пропускаются — manual recalc уже закончился."""
        from app.main import _running_recalcs
        _running_recalcs["seller-done"] = {
            "status": "done",
            "finished_at": "2026-05-20T00:00:00Z",
        }

        mock_sb = MagicMock()
        monkeypatch.setattr("app.jobs.recalc.fetch_all", lambda q: [{"id": "seller-done"}])
        monkeypatch.setattr("app.jobs.recalc.get_supabase", lambda: mock_sb)

        called_for = []
        def fake_recalc(sid, progress=None):
            called_for.append(sid)
            return {"products": 0, "metrics_written": 0, "alerts_written": 0,
                    "store_metrics_written": 0}
        monkeypatch.setattr("app.jobs.recalc.recalc_seller_all_periods", fake_recalc)

        from app.jobs.recalc import recalc_all_sellers
        result = recalc_all_sellers()

        assert "seller-done" in called_for
        assert result["skipped_concurrent"] == 0

    def test_no_lock_processes_all(self, monkeypatch):
        """Если _running_recalcs пустой — все sellers обрабатываются."""
        mock_sb = MagicMock()
        monkeypatch.setattr("app.jobs.recalc.fetch_all",
                            lambda q: [{"id": "s1"}, {"id": "s2"}, {"id": "s3"}])
        monkeypatch.setattr("app.jobs.recalc.get_supabase", lambda: mock_sb)

        called_for = []
        def fake_recalc(sid, progress=None):
            called_for.append(sid)
            return {"products": 0, "metrics_written": 0, "alerts_written": 0,
                    "store_metrics_written": 0}
        monkeypatch.setattr("app.jobs.recalc.recalc_seller_all_periods", fake_recalc)

        from app.jobs.recalc import recalc_all_sellers
        result = recalc_all_sellers()

        assert len(called_for) == 3
        assert result["sellers"] == 3
        assert result["skipped_concurrent"] == 0
