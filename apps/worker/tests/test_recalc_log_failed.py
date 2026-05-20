"""Тесты для БАГ 94 — детальное логирование failed_skus.

Покрываем _log_failed_sku:
  - Первые N фейлов → WARNING с err_type+err_msg в тексте
  - Остальные → INFO (короткий маркер)
  - extra dict содержит structured fields
"""
from __future__ import annotations
import os
os.environ["ENABLE_SCHEDULER"] = "false"

import logging
from unittest.mock import patch


class TestLogFailedSku:
    """БАГ 94: _log_failed_sku пишет в log с правильным уровнем и контекстом."""

    def test_warning_when_verbose_left(self, caplog):
        """verbose_remaining > 0 → WARNING level + err_type:err_msg в тексте."""
        from app.jobs.recalc import _log_failed_sku

        exc = ValueError("simulated failure 42")
        with caplog.at_level(logging.WARNING, logger="veloseller.recalc"):
            _log_failed_sku(
                phase="loop2_write",
                seller_id="seller-1",
                product_id="pid-abc",
                period_days=7,
                exc=exc,
                verbose_remaining=3,
            )

        # Должно быть ровно 1 WARNING запись
        warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
        assert len(warnings) == 1
        rec = warnings[0]
        # В тексте лога — err_type, err_msg, phase, pid, period
        assert "ValueError" in rec.message
        assert "simulated failure 42" in rec.message
        assert "loop2_write" in rec.message
        assert "pid-abc" in rec.message
        assert "period=7" in rec.message

    def test_extra_contains_structured_fields(self, caplog):
        """В .extra передаются structured поля для jq-парсинга."""
        from app.jobs.recalc import _log_failed_sku

        exc = RuntimeError("DB connection lost")
        with caplog.at_level(logging.WARNING, logger="veloseller.recalc"):
            _log_failed_sku(
                phase="loop1_compute",
                seller_id="seller-x",
                product_id="pid-y",
                period_days=30,
                exc=exc,
                verbose_remaining=1,
            )

        warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
        assert len(warnings) == 1
        rec = warnings[0]
        # Все поля присутствуют
        assert getattr(rec, "seller_id", None) == "seller-x"
        assert getattr(rec, "product_id", None) == "pid-y"
        assert getattr(rec, "phase", None) == "loop1_compute"
        assert getattr(rec, "period_days", None) == 30
        assert getattr(rec, "error_type", None) == "RuntimeError"
        assert getattr(rec, "error_msg", None) == "DB connection lost"

    def test_info_when_verbose_exhausted(self, caplog):
        """verbose_remaining == 0 → INFO level (короткий маркер, без err_msg в тексте)."""
        from app.jobs.recalc import _log_failed_sku

        exc = ValueError("should not appear in WARNING")
        with caplog.at_level(logging.DEBUG, logger="veloseller.recalc"):
            _log_failed_sku(
                phase="loop2_write",
                seller_id="seller-1",
                product_id="pid-quiet",
                period_days=7,
                exc=exc,
                verbose_remaining=0,
            )

        # WARNING не должно быть
        warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
        assert len(warnings) == 0
        # INFO должно быть
        infos = [r for r in caplog.records if r.levelno == logging.INFO]
        assert len(infos) == 1
        rec = infos[0]
        # В INFO записи — только err_type и pid, без err_msg
        assert "ValueError" in rec.message
        assert "pid-quiet" in rec.message
        # err_msg в самом тексте быть НЕ должно (только в extra)
        assert "should not appear in WARNING" not in rec.message

    def test_truncates_long_error_msg(self, caplog):
        """Сообщения > 300 символов обрезаются."""
        from app.jobs.recalc import _log_failed_sku

        long_msg = "x" * 500
        exc = ValueError(long_msg)
        with caplog.at_level(logging.WARNING, logger="veloseller.recalc"):
            _log_failed_sku(
                phase="test", seller_id="s", product_id="p",
                period_days=7, exc=exc, verbose_remaining=1,
            )

        warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
        rec = warnings[0]
        # err_msg в extra должен быть обрезан до 300 символов
        err_msg = getattr(rec, "error_msg", "")
        assert len(err_msg) <= 300

    def test_handles_various_exception_types(self, caplog):
        """Корректно работает с разными типами exceptions."""
        from app.jobs.recalc import _log_failed_sku

        test_cases = [
            (ValueError("v"), "ValueError"),
            (RuntimeError("r"), "RuntimeError"),
            (KeyError("k"), "KeyError"),
            (TypeError("t"), "TypeError"),
            (Exception("e"), "Exception"),
        ]

        for exc, expected_type in test_cases:
            caplog.clear()
            with caplog.at_level(logging.WARNING, logger="veloseller.recalc"):
                _log_failed_sku(
                    phase="test", seller_id="s", product_id="p",
                    period_days=7, exc=exc, verbose_remaining=1,
                )
            warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
            assert len(warnings) == 1, f"failed for {expected_type}"
            assert getattr(warnings[0], "error_type", None) == expected_type
