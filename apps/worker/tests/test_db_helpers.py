"""Тесты для fetch_all - пагинация Supabase запросов."""
from __future__ import annotations
from unittest.mock import MagicMock
import pytest

from app.db import fetch_all


def _make_query_builder(pages: list[list[dict]]):
    """Mock query builder where .range(a, b).execute() возвращает каждую страницу по очереди."""
    qb = MagicMock()
    page_iter = iter(pages)

    def range_mock(_start, _end):
        result = MagicMock()
        try:
            data = next(page_iter)
        except StopIteration:
            data = []
        result.execute = MagicMock(return_value=MagicMock(data=data))
        return result

    qb.range = MagicMock(side_effect=range_mock)
    return qb


class TestFetchAll:
    def test_single_page_under_limit(self):
        """Если 1 страница вернула < page_size, цикл завершается."""
        qb = _make_query_builder([[{"id": 1}, {"id": 2}, {"id": 3}]])
        rows = fetch_all(qb, page_size=1000)
        assert len(rows) == 3
        assert qb.range.call_count == 1
        qb.range.assert_called_with(0, 999)

    def test_pagination_two_pages(self):
        """Первая страница полная (=page_size) → запрашиваем вторую."""
        page1 = [{"id": i} for i in range(1000)]
        page2 = [{"id": 1000}, {"id": 1001}]  # частичная — стоп
        qb = _make_query_builder([page1, page2])
        rows = fetch_all(qb, page_size=1000)
        assert len(rows) == 1002
        assert qb.range.call_count == 2
        assert qb.range.call_args_list[0][0] == (0, 999)
        assert qb.range.call_args_list[1][0] == (1000, 1999)

    def test_pagination_three_pages_exactly(self):
        """3 страницы по 1000 + пустая 4-я — 3 вызова + 1 пустой."""
        full = [{"id": i} for i in range(1000)]
        qb = _make_query_builder([full, full, full, []])
        rows = fetch_all(qb, page_size=1000)
        assert len(rows) == 3000
        # Точно: 3 страницы по 1000 → нужна 4-я чтобы понять что данных больше нет
        assert qb.range.call_count == 4

    def test_empty_response(self):
        qb = _make_query_builder([[]])
        rows = fetch_all(qb, page_size=1000)
        assert rows == []
        assert qb.range.call_count == 1

    def test_custom_page_size(self):
        """Если page_size=100, range вызывается с (0, 99), (100, 199), ..."""
        page1 = [{"id": i} for i in range(100)]
        page2 = [{"id": 100}]  # < page_size, стоп
        qb = _make_query_builder([page1, page2])
        rows = fetch_all(qb, page_size=100)
        assert len(rows) == 101
        assert qb.range.call_args_list[0][0] == (0, 99)
        assert qb.range.call_args_list[1][0] == (100, 199)
