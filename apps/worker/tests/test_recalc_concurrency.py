"""Тест на БАГ 95 (бывший БАГ 50) — recalc_all_sellers skip при concurrent manual recalc.

БАГ 95: заменил in-memory _running_recalcs dict на DB-based lock через recalc_jobs table.
New test мокает get_recalc_state и try_acquire_recalc_lock из app.recalc_lock.
"""
from __future__ import annotations
import os
os.environ["ENABLE_SCHEDULER"] = "false"

from unittest.mock import MagicMock, patch


class TestRecalcAllConcurrencyLock:
    """БАГ 95: cron skip sellers с активным manual recalc."""

    def test_skips_sellers_with_running_status(self, monkeypatch):
        """Sellers с recalc_jobs.status='running' пропускаются без try_acquire."""
        mock_sb = MagicMock()
        monkeypatch.setattr("app.jobs.recalc.fetch_all",
                            lambda q: [{"id": "seller-busy"}, {"id": "seller-free"}])
        monkeypatch.setattr("app.jobs.recalc.get_supabase", lambda: mock_sb)

        # get_recalc_state: для busy → running, для free → None
        def fake_get_state(_sb, seller_id):
            if seller_id == "seller-busy":
                return {"status": "running", "started_at": "2026-05-20T00:00:00Z"}
            return None
        monkeypatch.setattr("app.recalc_lock.get_recalc_state", fake_get_state)

        # try_acquire всегда True (для free)
        monkeypatch.setattr("app.recalc_lock.try_acquire_recalc_lock", lambda _sb, _sid: True)
        monkeypatch.setattr("app.recalc_lock.mark_recalc_done", lambda _sb, _sid, _r: None)

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
        mock_sb = MagicMock()
        monkeypatch.setattr("app.jobs.recalc.fetch_all", lambda q: [{"id": "seller-done"}])
        monkeypatch.setattr("app.jobs.recalc.get_supabase", lambda: mock_sb)

        monkeypatch.setattr(
            "app.recalc_lock.get_recalc_state",
            lambda _sb, _sid: {"status": "done", "finished_at": "2026-05-20T00:00:00Z"},
        )
        monkeypatch.setattr("app.recalc_lock.try_acquire_recalc_lock", lambda _sb, _sid: True)
        monkeypatch.setattr("app.recalc_lock.mark_recalc_done", lambda _sb, _sid, _r: None)

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

        monkeypatch.setattr("app.recalc_lock.get_recalc_state", lambda _sb, _sid: None)
        monkeypatch.setattr("app.recalc_lock.try_acquire_recalc_lock", lambda _sb, _sid: True)
        monkeypatch.setattr("app.recalc_lock.mark_recalc_done", lambda _sb, _sid, _r: None)

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
        """БАГ 95: если status='done' но try_acquire вернул False (race с manual) — skip."""
        mock_sb = MagicMock()
        monkeypatch.setattr("app.jobs.recalc.fetch_all", lambda q: [{"id": "seller-racy"}])
        monkeypatch.setattr("app.jobs.recalc.get_supabase", lambda: mock_sb)

        monkeypatch.setattr(
            "app.recalc_lock.get_recalc_state",
            lambda _sb, _sid: {"status": "done"},  # свежий SELECT видит done
        )
        # Но между SELECT и UPSERT manual recalc взял lock — try_acquire вернул False
        monkeypatch.setattr("app.recalc_lock.try_acquire_recalc_lock", lambda _sb, _sid: False)

        called_for = []
        def fake_recalc(sid, progress=None):
            called_for.append(sid)
            return {}
        monkeypatch.setattr("app.jobs.recalc.recalc_seller_all_periods", fake_recalc)

        from app.jobs.recalc import recalc_all_sellers
        result = recalc_all_sellers()

        # recalc НЕ выполнялся — skip по race
        assert called_for == []
        assert result["sellers"] == 0
        assert result["skipped_concurrent"] == 1
