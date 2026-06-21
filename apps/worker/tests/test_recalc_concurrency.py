"""Тест конкурентности recalc_all_sellers — пропуск через ОБЩИЙ БД-лок.

Раньше cron смотрел только in-process dict _running_recalcs (не виден другим
репликам). Теперь recalc_all_sellers берёт тот же БД-лок, что и ручной recalc
(_try_acquire_recalc_lock), поэтому тест драйвит именно его.
"""
from __future__ import annotations
import os
os.environ["ENABLE_SCHEDULER"] = "false"

from unittest.mock import MagicMock


class TestRecalcAllConcurrencyLock:
    """Cron пропускает селлеров, по которым БД-лок занят (другой процесс/реплика)."""

    def _patch_common(self, monkeypatch, sellers, called_for):
        mock_sb = MagicMock()
        monkeypatch.setattr("app.jobs.recalc.fetch_all", lambda q: sellers)
        monkeypatch.setattr("app.jobs.recalc.get_supabase", lambda: mock_sb)

        def fake_recalc(sid, progress=None):
            called_for.append(sid)
            return {"products": 0, "metrics_written": 0, "alerts_written": 0,
                    "store_metrics_written": 0}
        monkeypatch.setattr("app.jobs.recalc.recalc_seller_all_periods", fake_recalc)
        # mark_done/error не должны ходить в БД в тесте
        monkeypatch.setattr("app.main._mark_recalc_done", lambda *a, **k: None)
        monkeypatch.setattr("app.main._mark_recalc_error", lambda *a, **k: None)

    def test_skips_sellers_when_lock_held(self, monkeypatch):
        called_for = []
        self._patch_common(monkeypatch,
                            [{"id": "seller-busy"}, {"id": "seller-free"}], called_for)
        # Лок занят по seller-busy (его держит другой процесс), свободен по seller-free
        monkeypatch.setattr("app.main._try_acquire_recalc_lock",
                            lambda sid: sid != "seller-busy")

        from app.jobs.recalc import recalc_all_sellers
        result = recalc_all_sellers()

        assert "seller-free" in called_for
        assert "seller-busy" not in called_for
        assert result["sellers"] == 1
        assert result["skipped_concurrent"] == 1

    def test_processes_when_lock_free(self, monkeypatch):
        called_for = []
        self._patch_common(monkeypatch, [{"id": "seller-done"}], called_for)
        monkeypatch.setattr("app.main._try_acquire_recalc_lock", lambda sid: True)

        from app.jobs.recalc import recalc_all_sellers
        result = recalc_all_sellers()

        assert "seller-done" in called_for
        assert result["skipped_concurrent"] == 0

    def test_no_lock_processes_all(self, monkeypatch):
        called_for = []
        self._patch_common(monkeypatch,
                            [{"id": "s1"}, {"id": "s2"}, {"id": "s3"}], called_for)
        monkeypatch.setattr("app.main._try_acquire_recalc_lock", lambda sid: True)

        from app.jobs.recalc import recalc_all_sellers
        result = recalc_all_sellers()

        assert len(called_for) == 3
        assert result["sellers"] == 3
        assert result["skipped_concurrent"] == 0
