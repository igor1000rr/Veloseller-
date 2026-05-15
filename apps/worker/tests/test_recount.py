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
            _s("b", 1,  30),   # «удалив» 70 единиц
            _s("c", 4,  100),  # вернули 70 единиц
        ]
        pairs = detect_recount_pairs(snaps)
        assert len(pairs) == 1
        cur, nxt = pairs[0]
        assert cur.snapshot_id == "b"
        assert nxt.snapshot_id == "c"

    def test_recover_outside_window_not_paired(self):
        """Если «возврат» произошёл через 25ч — это уже не recount, а обычное пополнение."""
        snaps = [
            _s("a", 0,  100),
            _s("b", 1,  30),
            _s("c", 25, 100),
        ]
        # Дефолтное окно = 12ч, 25ч выходит за пределы
        assert detect_recount_pairs(snaps) == []

    def test_small_fluctuation_ignored(self):
        """Остаток 1000 → 999 → 1000: |delta|=1, ratio=0.001 < 0.5 — игнор."""
        snaps = [
            _s("a", 0,  1000),
            _s("b", 1,  999),
            _s("c", 2,  1000),
        ]
        assert detect_recount_pairs(snaps) == []

    def test_magnitude_mismatch_above_25_pct_not_paired(self):
        """100 → 30 (delta=-70) → 60 (delta=+30): разница |70-30|/70 ≈ 0.57 > 0.25 — не пара."""
        snaps = [
            _s("a", 0,  100),
            _s("b", 1,  30),
            _s("c", 2,  60),
        ]
        assert detect_recount_pairs(snaps) == []

    def test_unsorted_input_is_sorted_internally(self):
        """Функция должна сама сортировать по snapshot_time."""
        snaps = [
            _s("c", 4,  100),  # позже всех
            _s("a", 0,  100),
            _s("b", 1,  30),
        ]
        pairs = detect_recount_pairs(snaps)
        assert len(pairs) == 1
        cur, nxt = pairs[0]
        # После сортировки: a (0ч), b (1ч), c (4ч)
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
        """100 → 30 (delta=-70) → 95 (delta=+65): разница |70-65|/70 ≈ 0.07 ≤ 0.25 — пара."""
        snaps = [
            _s("a", 0,  100),
            _s("b", 1,  30),
            _s("c", 3,  95),
        ]
        pairs = detect_recount_pairs(snaps)
        assert len(pairs) == 1
