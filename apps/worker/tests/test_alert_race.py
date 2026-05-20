"""Тесты на _upsert_or_skip_alert — БАГ 33 (race condition handling).

partial unique index alerts_unique_unread предотвращает дубли активных alerts.
При concurrent recalc для одного seller'а возможна гонка между SELECT и INSERT.
Тестируем что race condition корректно обрабатывается через try/except.
"""
from __future__ import annotations
from unittest.mock import MagicMock

import pytest

from app.jobs.recalc import _upsert_or_skip_alert


class TestUpsertAlertRaceCondition:
    """БАГ 33: ловим duplicate key error при race condition."""

    def test_insert_new_alert(self):
        """Нет существующего → insert → True."""
        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.is_.return_value.limit.return_value.execute.return_value = MagicMock(data=[])

        result = _upsert_or_skip_alert(mock_sb, "s1", "p1", "low_stock", "msg", {})
        assert result is True
        # Insert должен быть вызван
        mock_sb.table.return_value.insert.assert_called_once()

    def test_existing_alert_updated(self):
        """Существующий unread alert → update → False."""
        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.is_.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"id": "alert-1"}]
        )

        result = _upsert_or_skip_alert(mock_sb, "s1", "p1", "low_stock", "new msg", {})
        assert result is False
        # Update должен быть вызван, insert — нет
        mock_sb.table.return_value.update.assert_called_once()
        mock_sb.table.return_value.insert.assert_not_called()

    def test_race_condition_recovered_via_update(self, monkeypatch):
        """Между SELECT и INSERT другой процесс вставил → ловим duplicate key, делаем UPDATE."""
        mock_sb = MagicMock()

        # Сначала SELECT возвращает пустой результат — для нас alert'а нет
        # Insert падает с unique violation
        # Повторный SELECT возвращает alert'а, который вставил другой процесс
        select_call_count = {"n": 0}

        def select_chain():
            select_call_count["n"] += 1
            if select_call_count["n"] == 1:
                return MagicMock(data=[])
            return MagicMock(data=[{"id": "alert-from-race"}])

        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.is_.return_value.limit.return_value.execute.side_effect = select_chain

        # Insert падает с unique violation
        mock_sb.table.return_value.insert.return_value.execute.side_effect = Exception(
            "duplicate key value violates unique constraint \"alerts_unique_unread\""
        )

        # Update в результате race должен быть вызван
        result = _upsert_or_skip_alert(mock_sb, "s1", "p1", "low_stock", "msg", {})
        # Это False потому что мы НЕ создали новый alert — другой процесс уже создал
        assert result is False
        # Update должен быть вызван (после поимки race)
        mock_sb.table.return_value.update.assert_called()

    def test_postgres_23505_code_recognized(self, monkeypatch):
        """Postgres код 23505 unique_violation тоже распознаётся."""
        mock_sb = MagicMock()
        select_call_count = {"n": 0}

        def select_chain():
            select_call_count["n"] += 1
            if select_call_count["n"] == 1:
                return MagicMock(data=[])
            return MagicMock(data=[{"id": "alert-from-race"}])

        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.is_.return_value.limit.return_value.execute.side_effect = select_chain

        # Postgres returns 23505 code
        mock_sb.table.return_value.insert.return_value.execute.side_effect = Exception(
            "PostgreSQL error code 23505"
        )

        result = _upsert_or_skip_alert(mock_sb, "s1", "p1", "low_stock", "msg", {})
        assert result is False

    def test_non_unique_error_propagated(self):
        """Если ошибка НЕ unique violation — пробрасываем."""
        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.is_.return_value.limit.return_value.execute.return_value = MagicMock(data=[])

        # Какая-то другая ошибка (например, connection lost)
        mock_sb.table.return_value.insert.return_value.execute.side_effect = Exception(
            "Connection lost to database"
        )

        with pytest.raises(Exception, match="Connection lost"):
            _upsert_or_skip_alert(mock_sb, "s1", "p1", "low_stock", "msg", {})
