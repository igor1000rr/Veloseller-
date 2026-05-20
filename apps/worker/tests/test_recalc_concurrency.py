"""Тест на БАГ 95 — recalc_all_sellers skip при concurrent manual recalc.

БАГ 95: заменил in-memory _running_recalcs dict на DB-based lock через recalc_jobs table.
Патчим имя в app.jobs.recalc namespace (после module-level import from app.recalc_lock).
"""
from __future__ import annotations
import os
os.environ["ENABLE_SCHEDULER"] = "false"

from unittest.mock import MagicMock


class TestRecalcAllConcurrencyLock:
    """БАГ 95: cron skip sellers с активным manual recalc."""

    def test_skips_sellers_with_running_status(self, monkeypatch):
        """Sellers с recalc_jobs.status='running' пропускаются без try_acquire."""
        mock_sb = MagicMock()
        monkeypatch.setattr("app.jobs.recalc.fetch_all",
                            lambda q: [{"id": "seller-busy"}, {"id": "seller-free"}])
        monkeypatch.setattr("app.jobs.recalc.get_supabase", lambda: mock_sb)

        def fake_get_state(_sb, seller_id):
            if seller_id == "seller-busy":
                return {"status": "running", "started_at": "2026-05-20T00:00:00Z"}
            return None
        # БАГ 95: патч прямо в app.jobs.recalc namespace (после import from app.recalc_lock)
        monkeypatch.setattr("app.jobs.recalc.get_recalc_state", fake_get_state)
        monkeypatch.setattr("app.jobs.recalc.try_acquire_recalc_lock", lambda _sb, _sid: True)
        monkeypatch.setattr("app.jobs.recalc.mark_recalc_done", lambda _sb, _sid, _r: None)

        called_for = []
        def fake_recalc(sid, progress=None):
            called_for.append(sid)
            return {"products": 0, "metrics_written": 0, "alerts_written": 0,
                    "store_metrics_written": 0}
        monkeypatch.setattr("app.jobs.recalc.recalc_seller_all_periods", fake_recalc)

        from app.jobs.recalc import recalc_all_sellers
        result = recalc_all_sellers()

        assert "seller-free" in called_for
        assert "seller-busy" not in called_for
        assert result["sellers"] == 1
        assert result["skipped_concurrent"] == 1

    def test_processes_done_status_sellers(self, monkeypatch):
        """Sellers с done статусом НЕ пропускаются."""
        mock_sb = MagicMock()
        monkeypatch.setattr("app.jobs.recalc.fetch_all", lambda q: [{"id": "seller-done"}])
        monkeypatch.setattr("app.jobs.recalc.get_supabase", lambda: mock_sb)

        monkeypatch.setattr(
            "app.jobs.recalc.get_recalc_state",
            lambda _sb, _sid: {"status": "done", "finished_at": "2026-05-20T00:00:00Z"},
        )
        monkeypatch.setattr("app.jobs.recalc.try_acquire_recalc_lock", lambda _sb, _sid: True)
        monkeypatch.setattr("app.jobs.recalc.mark_recalc_done", lambda _sb, _sid, _r: None)

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
        """Если нигде нет running state — все sellers обрабатываются."""
        mock_sb = MagicMock()
        monkeypatch.setattr("app.jobs.recalc.fetch_all",
                            lambda q: [{"id": "s1"}, {"id": "s2"}, {"id": "s3"}])
        monkeypatch.setattr("app.jobs.recalc.get_supabase", lambda: mock_sb)

        monkeypatch.setattr("app.jobs.recalc.get_recalc_state", lambda _sb, _sid: None)
        monkeypatch.setattr("app.jobs.recalc.try_acquire_recalc_lock", lambda _sb, _sid: True)
        monkeypatch.setattr("app.jobs.recalc.mark_recalc_done", lambda _sb, _sid, _r: None)

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

    def test_lock_race_after_status_check(self, monkeypatch):
        """БАГ 95: status='done' но try_acquire вернул False (race с manual) — skip."""
        mock_sb = MagicMock()
        monkeypatch.setattr("app.jobs.recalc.fetch_all", lambda q: [{"id": "seller-racy"}])
        monkeypatch.setattr("app.jobs.recalc.get_supabase", lambda: mock_sb)

        monkeypatch.setattr(
            "app.jobs.recalc.get_recalc_state",
            lambda _sb, _sid: {"status": "done"},
        )
        monkeypatch.setattr("app.jobs.recalc.try_acquire_recalc_lock", lambda _sb, _sid: False)

        called_for = []
        def fake_recalc(sid, progress=None):
            called_for.append(sid)
            return {}
        monkeypatch.setattr("app.jobs.recalc.recalc_seller_all_periods", fake_recalc)

        from app.jobs.recalc import recalc_all_sellers
        result = recalc_all_sellers()

        assert called_for == []
        assert result["sellers"] == 0
        assert result["skipped_concurrent"] == 1
