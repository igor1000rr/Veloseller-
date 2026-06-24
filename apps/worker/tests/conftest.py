"""Общие фикстуры тестов воркера."""
from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _disable_wb_stocks_throttle():
    """Отключаем per-token трокл WB /supplier/stocks во ВСЕХ тестах.

    Трокл держит module-state (_stocks_next_allowed) и делает реальный
    time.sleep(≥61с) между вызовами одного токена. Тесты массово зовут
    wildberries.fetch_snapshots("token") одним и тем же токеном — без обнуления
    интервала второй же вызов висел бы минуту. Прод-поведение трокла проверяется
    отдельным юнит-тестом с подменённым временем (test_sources_marketplaces).
    """
    from app.sources import wildberries

    orig = wildberries._STOCKS_MIN_INTERVAL_SEC
    wildberries._STOCKS_MIN_INTERVAL_SEC = 0.0
    wildberries._stocks_next_allowed.clear()
    try:
        yield
    finally:
        wildberries._STOCKS_MIN_INTERVAL_SEC = orig
        wildberries._stocks_next_allowed.clear()
