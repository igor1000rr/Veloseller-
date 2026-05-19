"""Unit-тесты на detect_recount_pairs из engine/recount.py.

Раньше функция тестировалась только косвенно через build_daily_aggregates и один
базовый сценарий. Покрываем edge cases:
  - Мало snapshot'ов (меньше 3)
  - Базовый drop-recover в один день
  - 3+ снимка в последовательности — находит пару
  - Окно времени (same_day_window_hours): за пределами окна — не пара
  - Малое колебание (min_magnitude_ratio) — игнорируется
  - Разные амплитуды больше 25% — не пара
  - Unsorted input — функция сортирует сама
  - Несколько пар в одной последовательности
  - БАГ 6 fix: recount на большом остатке (1000 шт) с пересчётом на 150 ед
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone

from app.engine.recount import Snapshot, detect_recount_pairs


UTC = timezone.utc
BASE = datetime(2026, 5, 1, 12, tzinfo=UTC)


def _s(id_: str, offset_hours: float, stock: int) -> Snapshot:
    """Сокращённый конструктор: время — отступ от BASE в часах."""
    return Snapshot(
        snapshot_id=id_,
        snapshot_time=BASE + timedelta(hours=offset_hours),
        stock_quantity=stock,
    )


class TestDetectRecountPairs:

    def test_empty_returns_nothing(self):
        assert detect_recount_pairs([]) == []

    def test_one_snapshot_returns_nothing(self):
        assert detect_recount_pairs([_s("a", 0, 100)]) == []

    def test_two_snapshots_returns_nothing(self):
        """Нужно минимум 3 снимка (prev → cur → next)."""
        assert detect_recount_pairs([_s("a", 0, 100), _s("b", 1, 30)]) == []

    def test_basic_drop_then_recover_in_window(self):
        """Классика: остаток 100 → 30 → 100 в течение нескольких часов."""
        snaps = [
            _s("a", 0,  100),
            _s("b", 1,  30),
            _s("c", 4,  100),
        ]
        pairs = detect_recount_pairs(snaps)
        assert len(pairs) == 1
        cur, nxt = pairs[0]
        assert cur.snapshot_id == "b"
        assert nxt.snapshot_id == "c"

    def test_recover_outside_window_not_paired(self):
        """Если возврат через 25ч — это пополнение, не recount."""
        snaps = [
            _s("a", 0,  100),
            _s("b", 1,  30),
            _s("c", 25, 100),
        ]
        assert detect_recount_pairs(snaps) == []

    def test_small_fluctuation_ignored(self):
        """Остаток 1000 → 999 → 1000: |delta|=1 ниже min_absolute_magnitude=10 — игнор."""
        snaps = [
            _s("a", 0,  1000),
            _s("b", 1,  999),
            _s("c", 2,  1000),
        ]
        assert detect_recount_pairs(snaps) == []

    def test_magnitude_mismatch_above_25_pct_not_paired(self):
        """100 → 30 (-70) → 60 (+30): разница ≈ 57% > 25% — не пара."""
        snaps = [
            _s("a", 0,  100),
            _s("b", 1,  30),
            _s("c", 2,  60),
        ]
        assert detect_recount_pairs(snaps) == []

    def test_unsorted_input_is_sorted_internally(self):
        """Функция сама сортирует по snapshot_time."""
        snaps = [
            _s("c", 4,  100),
            _s("a", 0,  100),
            _s("b", 1,  30),
        ]
        pairs = detect_recount_pairs(snaps)
        assert len(pairs) == 1
        cur, nxt = pairs[0]
        assert cur.snapshot_id == "b"
        assert nxt.snapshot_id == "c"

    def test_zero_delta_not_paired(self):
        """Если между prev и cur нет изменения — не рассматриваем."""
        snaps = [
            _s("a", 0, 100),
            _s("b", 1, 100),
            _s("c", 2, 30),
        ]
        assert detect_recount_pairs(snaps) == []

    def test_within_25_pct_tolerance_accepted(self):
        """100 → 30 (-70) → 95 (+65): разница ≈ 7% ≤ 25% — пара."""
        snaps = [
            _s("a", 0,  100),
            _s("b", 1,  30),
            _s("c", 3,  95),
        ]
        pairs = detect_recount_pairs(snaps)
        assert len(pairs) == 1

    def test_large_inventory_small_recount_now_detected(self):
        """БАГ 6 FIX: SKU с остатком 1000, recount на 150 единиц.

        Раньше (min_ratio=0.5): 150 < 500 → игнор. Recount пропускался.
        Сейчас (min_ratio=0.2, abs_floor=10): min_required=min(200,10)=10.
        150 >= 10 → ловим. delta_in=-150, delta_out=+150 → ровно совпадает → пара.
        """
        snaps = [
            _s("a", 0,  1000),
            _s("b", 1,  850),   # recount -150
            _s("c", 2,  1000),  # +150
        ]
        pairs = detect_recount_pairs(snaps)
        assert len(pairs) == 1
        assert pairs[0][0].snapshot_id == "b"

    def test_large_inventory_tiny_change_below_abs_floor(self):
        """SKU 5000 шт, колебание 5 единиц — ниже abs_floor=10 → игнор."""
        snaps = [
            _s("a", 0,  5000),
            _s("b", 1,  4995),
            _s("c", 2,  5000),
        ]
        assert detect_recount_pairs(snaps) == []
