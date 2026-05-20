"""Тесты для app/recalc_lock.py (БАГ 95: DB-based recalc lock).

Покрываем:
  - try_acquire_recalc_lock — TRUE/FALSE из RPC + exception handling
  - mark_recalc_done / mark_recalc_error — корректные RPC вызовы
  - update_recalc_progress — best-effort (не падает на exception)
  - get_recalc_state — возвращает row или None
  - _json_safe — datetime/date → isoformat для JSONB
"""
from __future__ import annotations
import os
os.environ["ENABLE_SCHEDULER"] = "false"

from datetime import date, datetime, timezone
from unittest.mock import MagicMock

from app.recalc_lock import (
    _json_safe,
    get_recalc_state,
    mark_recalc_done,
    mark_recalc_error,
    try_acquire_recalc_lock,
    update_recalc_progress,
)


SELLER_ID = "e113ebfb-3409-4cca-b0ab-0a7d965f4cba"


class TestTryAcquireRecalcLock:
    def test_returns_true_when_rpc_returns_true(self):
        """RPC вернул TRUE → lock acquired."""
        mock_sb = MagicMock()
        mock_sb.rpc.return_value.execute.return_value = MagicMock(data=True)
        result = try_acquire_recalc_lock(mock_sb, SELLER_ID)
        assert result is True
        # RPC вызван с правильными параметрами
        mock_sb.rpc.assert_called_once()
        args = mock_sb.rpc.call_args
        assert args[0][0] == "try_acquire_recalc_lock"
        params = args[0][1]
        assert params["p_seller_id"] == SELLER_ID
        assert "p_worker_id" in params  # автогенерирован

    def test_returns_false_when_rpc_returns_false(self):
        """RPC вернул FALSE → lock уже занят."""
        mock_sb = MagicMock()
        mock_sb.rpc.return_value.execute.return_value = MagicMock(data=False)
        result = try_acquire_recalc_lock(mock_sb, SELLER_ID)
        assert result is False

    def test_returns_false_when_rpc_raises(self):
        """Exception в RPC → False (не падаем, не берём lock)."""
        mock_sb = MagicMock()
        mock_sb.rpc.return_value.execute.side_effect = RuntimeError("DB down")
        result = try_acquire_recalc_lock(mock_sb, SELLER_ID)
        assert result is False

    def test_passes_worker_id_when_provided(self):
        """Кастомный worker_id передаётся в RPC."""
        mock_sb = MagicMock()
        mock_sb.rpc.return_value.execute.return_value = MagicMock(data=True)
        try_acquire_recalc_lock(mock_sb, SELLER_ID, worker_id="custom:42")
        params = mock_sb.rpc.call_args[0][1]
        assert params["p_worker_id"] == "custom:42"

    def test_returns_false_when_rpc_returns_none(self):
        """RPC вернул None (странный случай) → trated как False."""
        mock_sb = MagicMock()
        mock_sb.rpc.return_value.execute.return_value = MagicMock(data=None)
        result = try_acquire_recalc_lock(mock_sb, SELLER_ID)
        assert result is False


class TestMarkRecalcDone:
    def test_calls_rpc_with_seller_and_result(self):
        mock_sb = MagicMock()
        result = {"products": 100, "metrics_written": 99}
        mark_recalc_done(mock_sb, SELLER_ID, result)
        mock_sb.rpc.assert_called_once()
        args = mock_sb.rpc.call_args
        assert args[0][0] == "mark_recalc_done"
        params = args[0][1]
        assert params["p_seller_id"] == SELLER_ID
        assert params["p_result"] == result

    def test_silently_ignores_rpc_failure(self):
        """Если RPC упал — не бросаем exception (worker не должен падать)."""
        mock_sb = MagicMock()
        mock_sb.rpc.return_value.execute.side_effect = RuntimeError("DB down")
        # Не бросает
        mark_recalc_done(mock_sb, SELLER_ID, {"products": 0})

    def test_serializes_datetime_in_result(self):
        """datetime в result → isoformat для JSONB."""
        mock_sb = MagicMock()
        result = {
            "products": 5,
            "finished_at": datetime(2026, 5, 20, 12, 0, tzinfo=timezone.utc),
        }
        mark_recalc_done(mock_sb, SELLER_ID, result)
        params = mock_sb.rpc.call_args[0][1]
        assert isinstance(params["p_result"]["finished_at"], str)
        assert "2026-05-20" in params["p_result"]["finished_at"]


class TestMarkRecalcError:
    def test_calls_rpc_with_error_text(self):
        mock_sb = MagicMock()
        mark_recalc_error(mock_sb, SELLER_ID, "OOM killed")
        params = mock_sb.rpc.call_args[0][1]
        assert params["p_seller_id"] == SELLER_ID
        assert params["p_error_text"] == "OOM killed"

    def test_truncates_long_error_text(self):
        """>500 символов обрезается на стороне Python (RPC тоже обрезает)."""
        mock_sb = MagicMock()
        long_err = "x" * 1000
        mark_recalc_error(mock_sb, SELLER_ID, long_err)
        params = mock_sb.rpc.call_args[0][1]
        assert len(params["p_error_text"]) <= 500

    def test_silently_ignores_rpc_failure(self):
        mock_sb = MagicMock()
        mock_sb.rpc.return_value.execute.side_effect = RuntimeError("DB down")
        mark_recalc_error(mock_sb, SELLER_ID, "any error")  # не бросает


class TestUpdateRecalcProgress:
    def test_calls_rpc_with_progress(self):
        mock_sb = MagicMock()
        progress = {"phase": "processing", "processed": 100, "total": 1879}
        update_recalc_progress(mock_sb, SELLER_ID, progress)
        args = mock_sb.rpc.call_args
        assert args[0][0] == "update_recalc_progress"
        assert args[0][1]["p_seller_id"] == SELLER_ID
        assert args[0][1]["p_progress"] == progress

    def test_silently_ignores_failures(self):
        """Best-effort: progress не критичен."""
        mock_sb = MagicMock()
        mock_sb.rpc.return_value.execute.side_effect = RuntimeError("DB down")
        update_recalc_progress(mock_sb, SELLER_ID, {"phase": "loading"})  # не бросает


class TestGetRecalcState:
    def test_returns_dict_when_row_exists(self):
        mock_sb = MagicMock()
        row = {
            "seller_id": SELLER_ID, "status": "running",
            "started_at": "2026-05-20T12:00:00+00:00",
        }
        mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[row]
        )
        result = get_recalc_state(mock_sb, SELLER_ID)
        assert result == row
        mock_sb.table.assert_called_with("recalc_jobs")

    def test_returns_none_when_no_row(self):
        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[]
        )
        result = get_recalc_state(mock_sb, SELLER_ID)
        assert result is None

    def test_returns_none_on_exception(self):
        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.execute.side_effect = (
            RuntimeError("DB down")
        )
        result = get_recalc_state(mock_sb, SELLER_ID)
        assert result is None


class TestJsonSafe:
    def test_datetime_to_isoformat(self):
        dt = datetime(2026, 5, 20, 12, 0, tzinfo=timezone.utc)
        result = _json_safe(dt)
        assert isinstance(result, str)
        assert "2026-05-20" in result

    def test_date_to_isoformat(self):
        d = date(2026, 5, 20)
        result = _json_safe(d)
        assert result == "2026-05-20"

    def test_nested_dict(self):
        obj = {
            "phase": "running",
            "started_at": datetime(2026, 5, 20, tzinfo=timezone.utc),
            "nested": {"day": date(2026, 1, 1)},
        }
        result = _json_safe(obj)
        assert isinstance(result["started_at"], str)
        assert result["nested"]["day"] == "2026-01-01"
        assert result["phase"] == "running"

    def test_list_with_datetimes(self):
        obj = [datetime(2026, 1, 1, tzinfo=timezone.utc), "plain", 42]
        result = _json_safe(obj)
        assert isinstance(result[0], str)
        assert result[1] == "plain"
        assert result[2] == 42

    def test_strips_underscore_keys(self):
        """_-prefixed keys (внутренние callbacks) пропускаются."""
        obj = {"phase": "loading", "_callback": lambda: None}
        result = _json_safe(obj)
        assert "_callback" not in result
        assert result["phase"] == "loading"

    def test_passthrough_primitives(self):
        assert _json_safe(42) == 42
        assert _json_safe("hello") == "hello"
        assert _json_safe(3.14) == 3.14
        assert _json_safe(None) is None
        assert _json_safe(True) is True
