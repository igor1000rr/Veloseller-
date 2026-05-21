"""Unit-тесты для календаря праздников."""
from datetime import date
from app.holidays import is_holiday, russian_federal_holidays


def test_new_year_holidays():
    for day in range(1, 9):
        assert is_holiday(date(2026, 1, day)), f"1-8 января должны быть праздниками (день {day})"
    assert not is_holiday(date(2026, 1, 9)), "9 января уже не праздник"


def test_fixed_holidays():
    assert is_holiday(date(2026, 2, 23))
    assert is_holiday(date(2026, 3, 8))
    assert is_holiday(date(2026, 5, 1))
    assert is_holiday(date(2026, 5, 9))
    assert is_holiday(date(2026, 6, 12))
    assert is_holiday(date(2026, 11, 4))


def test_non_holidays():
    assert not is_holiday(date(2026, 4, 1))
    assert not is_holiday(date(2026, 7, 15))
    assert not is_holiday(date(2026, 12, 31))
    assert not is_holiday(date(2026, 10, 5))


def test_holidays_cached_per_year():
    """Разные годы — разные объекты, внутри года тот же объект (lru_cache)."""
    h2026a = russian_federal_holidays(2026)
    h2026b = russian_federal_holidays(2026)
    h2027 = russian_federal_holidays(2027)
    assert h2026a is h2026b
    assert h2026a is not h2027
    assert date(2026, 1, 1) in h2026a
    assert date(2027, 1, 1) in h2027


def test_total_holidays_count():
    """14 дней: 8 новогодних + 6 однодневки."""
    assert len(russian_federal_holidays(2026)) == 14
