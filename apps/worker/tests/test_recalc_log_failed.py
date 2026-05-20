"""Тесты для БАГ 94 — детальное логирование failed_skus.

Покрываем _log_failed_sku — что функция:
  - Не падает при разных параметрах
  - Уважает verbose_remaining (WARNING vs INFO branch)
  - Корректно обрезает длинные error messages
"""
from __future__ import annotations
import os
os.environ["ENABLE_SCHEDULER"] = "false"

from unittest.mock import MagicMock, patch


class TestLogFailedSku:
    """БАГ 94: smoke-тесты _log_failed_sku.

    Проверяем что функция вызывает правильный метод logger'а
    в зависимости от verbose_remaining, и не падает на разных exception типах.
    """

    def test_warning_branch_when_verbose_left(self):
        """verbose_remaining > 0 → logger.warning вызван, не logger.info."""
        from app.jobs import recalc

        mock_logger = MagicMock()
        with patch.object(recalc, "logger", mock_logger):
            recalc._log_failed_sku(
                phase="loop2_write",
                seller_id="seller-1",
                product_id="pid-abc",
                period_days=7,
                exc=ValueError("simulated failure"),
                verbose_remaining=3,
            )

        # warning вызван, info — нет
        assert mock_logger.warning.called
        assert not mock_logger.info.called
        # Первый позиционный аргумент warning — формат-строка
        call = mock_logger.warning.call_args
        # Проверяем что в call args или kwargs есть наши данные
        args = call[0]
        kwargs = call[1]
        # ValueError упоминается в args
        all_args_str = " ".join(str(a) for a in args)
        assert "ValueError" in all_args_str
        # extra содержит structured fields
        extra = kwargs.get("extra", {})
        assert extra.get("product_id") == "pid-abc"
        assert extra.get("phase") == "loop2_write"
        assert extra.get("seller_id") == "seller-1"
        assert extra.get("period_days") == 7
        assert extra.get("error_type") == "ValueError"
        assert extra.get("error_msg") == "simulated failure"

    def test_info_branch_when_verbose_exhausted(self):
        """verbose_remaining == 0 → logger.info вызван, не logger.warning."""
        from app.jobs import recalc

        mock_logger = MagicMock()
        with patch.object(recalc, "logger", mock_logger):
            recalc._log_failed_sku(
                phase="loop2_write",
                seller_id="seller-1",
                product_id="pid-quiet",
                period_days=7,
                exc=ValueError("should not flood logs"),
                verbose_remaining=0,
            )

        # info вызван, warning — нет
        assert mock_logger.info.called
        assert not mock_logger.warning.called

    def test_truncates_long_error_msg(self):
        """Сообщения > 300 символов обрезаются в extra.error_msg."""
        from app.jobs import recalc

        long_msg = "x" * 500
        mock_logger = MagicMock()
        with patch.object(recalc, "logger", mock_logger):
            recalc._log_failed_sku(
                phase="t", seller_id="s", product_id="p",
                period_days=7, exc=ValueError(long_msg),
                verbose_remaining=1,
            )

        call = mock_logger.warning.call_args
        extra = call[1].get("extra", {})
        # err_msg в extra обрезан до 300 символов
        assert len(extra["error_msg"]) <= 300

    def test_handles_various_exception_types(self):
        """Корректно работает с разными типами exceptions."""
        from app.jobs import recalc

        test_cases = [
            (ValueError("v"), "ValueError"),
            (RuntimeError("r"), "RuntimeError"),
            (KeyError("k"), "KeyError"),
            (TypeError("t"), "TypeError"),
            (Exception("e"), "Exception"),
        ]

        for exc, expected_type in test_cases:
            mock_logger = MagicMock()
            with patch.object(recalc, "logger", mock_logger):
                recalc._log_failed_sku(
                    phase="t", seller_id="s", product_id="p",
                    period_days=7, exc=exc, verbose_remaining=1,
                )
            call = mock_logger.warning.call_args
            extra = call[1].get("extra", {})
            assert extra["error_type"] == expected_type, f"failed for {expected_type}"

    def test_does_not_raise_on_any_input(self):
        """Smoke: функция никогда не должна бросать exception на валидном вводе."""
        from app.jobs import recalc

        # Различные edge cases — функция должна работать с любым
        cases = [
            (ValueError("ok"), 0),  # verbose exhausted
            (RuntimeError(""), 5),  # empty error msg
            (Exception("a" * 1000), 1),  # very long msg
            (KeyError(None), 2),  # weird exception
        ]
        mock_logger = MagicMock()
        with patch.object(recalc, "logger", mock_logger):
            for exc, verbose in cases:
                # Не должно бросать
                recalc._log_failed_sku(
                    phase="test", seller_id="s", product_id="p",
                    period_days=30, exc=exc, verbose_remaining=verbose,
                )
        # logger был вызван 4 раза суммарно (warning или info)
        total_calls = mock_logger.warning.call_count + mock_logger.info.call_count
        assert total_calls == 4
