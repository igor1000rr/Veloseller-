"""Тесты парсинга/сопоставления для импорта себестоимости (cost_import_api)."""
from __future__ import annotations

import pytest

from app.cost_import_api import (
    _excel_col_to_index,
    _parse_cost,
    build_cost_map,
)


def test_excel_col_to_index_basic():
    assert _excel_col_to_index("A") == 0
    assert _excel_col_to_index("D") == 3
    assert _excel_col_to_index("F") == 5
    assert _excel_col_to_index("Z") == 25


def test_excel_col_to_index_multi_letter():
    assert _excel_col_to_index("AA") == 26
    assert _excel_col_to_index("AB") == 27
    assert _excel_col_to_index("a") == 0  # регистронезависимо


def test_excel_col_to_index_invalid():
    for bad in ("", "1", "D1", " ", "А"):  # последняя — кириллическая А
        with pytest.raises(ValueError):
            _excel_col_to_index(bad)


def test_parse_cost_numbers():
    assert _parse_cost(100) == 100.0
    assert _parse_cost(99.5) == 99.5
    assert _parse_cost("1234.56") == 1234.56
    assert _parse_cost("1 234,56") == 1234.56
    assert _parse_cost("1\xa0234 ₽") == 1234.0
    assert _parse_cost("450 руб") == 450.0


def test_parse_cost_rejects():
    assert _parse_cost(None) is None
    assert _parse_cost("") is None
    assert _parse_cost("   ") is None
    assert _parse_cost("abc") is None
    assert _parse_cost(-5) is None
    assert _parse_cost(True) is None  # bool не считаем числом


def test_build_cost_map_positional():
    # колонки: 0=name, 1=sku(B), 2=прочее, 3=cost(D)
    grid = [
        ["Название", "Артикул", "x", "Себестоимость"],  # заголовок — не сматчится
        ["Дрель X", "SKU-1", "y", "1 200,50"],
        ["Шуруповёрт", "SKU-2", "y", "800"],
        ["Без цены", "SKU-3", "y", ""],          # нет цены — пропуск
        ["Дубль", "SKU-1", "y", "1500"],          # перезапишет SKU-1
    ]
    m = build_cost_map(grid, art_idx=1, cost_idx=3)
    # Заголовок «Артикул»→«Себестоимость» не парсится как число → его нет.
    assert "Артикул" not in m
    assert m["SKU-1"] == 1500.0  # последнее значение победило
    assert m["SKU-2"] == 800.0
    assert "SKU-3" not in m


def test_build_cost_map_short_rows():
    # строка короче cost_idx — пропускаем без ошибки
    grid = [["SKU-1"], ["SKU-2", "x", "500"]]
    m = build_cost_map(grid, art_idx=0, cost_idx=2)
    assert m == {"SKU-2": 500.0}
