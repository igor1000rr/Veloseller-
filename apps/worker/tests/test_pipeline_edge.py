"""Edge cases для pipeline.compute_metrics_for_sku.

Включает критические тесты после аудита точности:
  - БАГ 1: MISSING_DATA не считается stockout
  - БАГ 2: pipeline принимает pre-period history_for_median
  - БАГ 4: confidence штрафует за малую историю sales_like

Старые сценарии тоже сохранены:
  - Период из одних аномалий
  - Replenishment в середине sales-периода
  - Continuity correction с разным числом excluded
"""
from __future__ import annotations
from datetime import date
from uuid import uuid4

import pytest

from app.engine.pipeline import DailyAggregate, compute_metrics_for_sku
from app.schemas import EventType, InventorySegment


def _agg(day: date, *, stock: int, event: EventType, delta: int | None,
         availability: bool = True, excluded: bool = False, price: float = 10.0) -> DailyAggregate:
    return DailyAggregate(
        day=day, availability=availability, end_of_day_stock=stock, price=price,
        event_type=event, delta_stock=delta, excluded_from_confirmed_metrics=excluded,
    )


class TestPipelineEdgeCases:

    def test_all_anomaly_period_zero_confirmed_velocity(self):
        """7 дней все ANOMALY_LIKE → ничего не подтверждено, confidence низкий (floor)."""
        ps, pe = date(2026, 1, 1), date(2026, 1, 7)
        aggs = [
            _agg(date(2026, 1, 1 + i), stock=100 - i * 10,
                 event=EventType.ANOMALY_LIKE, delta=-10, excluded=True)
            for i in range(7)
        ]
        m = compute_metrics_for_sku(str(uuid4()), ps, pe, aggs, current_stock=30)
        assert m.confirmed_velocity == 0.0
        # 0 sales_like + 7 anomaly → штрафы 100 (anomaly) + 35 (low_history) → floor 40
        assert m.confidence_score == 40.0
        assert m.in_stock_days == 7
        assert m.stockout_days == 0

    def test_all_anomaly_soft_velocity_rescue(self):
        """Деадлок-в-0 fix: период из одних anomaly_like с реальным расходом теперь
        даёт adjusted_velocity > 0 через soft-velocity, а не 0 (ложно «мёртвый»)."""
        ps, pe = date(2026, 1, 1), date(2026, 1, 7)
        aggs = [
            _agg(date(2026, 1, 1 + i), stock=100 - i * 10,
                 event=EventType.ANOMALY_LIKE, delta=-10, excluded=True)
            for i in range(7)
        ]
        m = compute_metrics_for_sku(str(uuid4()), ps, pe, aggs, current_stock=30)
        # soft median по дельтам [10]*7 = 10 → adj = (0 + 10*7)/7 = 10
        assert m.adjusted_velocity == pytest.approx(10.0, abs=0.01)
        assert m.coverage_days == pytest.approx(3.0, abs=0.01)
        assert m.confirmed_velocity == 0.0  # чистых sales_like нет — оценка грубая

    def test_dead_inventory_segment_when_no_sales_long_in_stock(self):
        """Мёртвый неликвид: 30 дней в наличии, ноль продаж, остаток > 0 →
        segment DEAD_INVENTORY_RISK (а не INSUFFICIENT_DATA) → попадёт в frozen."""
        ps, pe = date(2026, 1, 1), date(2026, 1, 30)
        aggs = [
            _agg(date(2026, 1, 1 + i), stock=50, event=EventType.NO_CHANGE, delta=0)
            for i in range(30)
        ]
        m = compute_metrics_for_sku(str(uuid4()), ps, pe, aggs, current_stock=50)
        assert m.adjusted_velocity == 0.0
        assert m.coverage_days is None
        assert m.segment == InventorySegment.DEAD_INVENTORY_RISK

    def test_new_product_not_marked_dead(self):
        """Страж новизны: товар в наличии лишь 5 дней без продаж НЕ считается мёртвым
        (in_stock_days < порога) — остаётся INSUFFICIENT_DATA."""
        ps, pe = date(2026, 1, 1), date(2026, 1, 5)
        aggs = [
            _agg(date(2026, 1, 1 + i), stock=50, event=EventType.NO_CHANGE, delta=0)
            for i in range(5)
        ]
        m = compute_metrics_for_sku(str(uuid4()), ps, pe, aggs, current_stock=50)
        assert m.adjusted_velocity == 0.0
        assert m.segment == InventorySegment.INSUFFICIENT_DATA

    def test_all_missing_data_period_not_stockout(self):
        """БАГ 1 FIX: 7 дней все MISSING_DATA → stockout_days=0, in_stock_days=0.

        Раньше missing_data считалось как stockout что завышало lost_revenue.
        Теперь missing day = «не знаем» и не входит ни в in_stock ни в stockout.
        Confidence остаётся низкой (штраф за missing).
        """
        ps, pe = date(2026, 1, 1), date(2026, 1, 7)
        aggs = [
            _agg(date(2026, 1, 1 + i), stock=0,
                 event=EventType.MISSING_DATA, delta=None,
                 availability=False, excluded=True)
            for i in range(7)
        ]
        m = compute_metrics_for_sku(str(uuid4()), ps, pe, aggs, current_stock=0)
        assert m.confirmed_velocity == 0.0
        assert m.adjusted_velocity == 0.0
        assert m.in_stock_days == 0
        # ← главное изменение: 0 а не 7
        assert m.stockout_days == 0
        # Confidence всё равно низкий благодаря missing_data + low_history penalty
        assert m.confidence_score == 40.0
        assert m.coverage_days is None
        assert m.segment == InventorySegment.INSUFFICIENT_DATA

    def test_partial_missing_does_not_inflate_stockout(self):
        """БАГ 1 FIX: 5 sales + 5 missing → stockout=0 (не 5).

        Раньше эти 5 missing дней попадали в stockout_days, что приводило к:
          - Завышению lost_revenue (× missing_days × price)
          - Ложному repeated_stockout_alert (срабатывает при stockout>3)
        """
        ps, pe = date(2026, 1, 1), date(2026, 1, 10)
        aggs = []
        for i in range(5):
            aggs.append(_agg(date(2026, 1, 1 + i), stock=100 - i * 2,
                             event=EventType.SALES_LIKE, delta=-2))
        for i in range(5):
            aggs.append(_agg(date(2026, 1, 6 + i), stock=90,
                             event=EventType.MISSING_DATA, delta=None,
                             availability=False, excluded=True))
        m = compute_metrics_for_sku(str(uuid4()), ps, pe, aggs, current_stock=90)
        assert m.in_stock_days == 5
        # ← главное: missing дни НЕ stockout
        assert m.stockout_days == 0

    def test_real_stockout_still_counted(self):
        """Sanity check: настоящий out-of-stock (availability=False, не missing) считается."""
        ps, pe = date(2026, 1, 1), date(2026, 1, 10)
        aggs = []
        for i in range(7):
            aggs.append(_agg(date(2026, 1, 1 + i), stock=100 - i * 2,
                             event=EventType.SALES_LIKE, delta=-2))
        # 3 дня настоящий stockout — есть snapshot но stock=0
        for i in range(3):
            aggs.append(_agg(date(2026, 1, 8 + i), stock=0,
                             event=EventType.NO_CHANGE, delta=0,
                             availability=False, excluded=False))
        m = compute_metrics_for_sku(str(uuid4()), ps, pe, aggs, current_stock=0)
        assert m.in_stock_days == 7
        assert m.stockout_days == 3  # реальный OOS считается

    def test_history_for_median_uses_provided(self):
        """БАГ 2 FIX: переданный history_for_median имеет приоритет над текущим периодом.

        Сценарий: 3 sales + 7 anomaly (excluded). Текущая медиана из 3 sales = 3.
        Если передаём pre-period history с медианой = 10, adjusted_velocity должен
        использовать именно 10 (из истории), а не 3 (из текущего периода).
        """
        ps, pe = date(2026, 1, 1), date(2026, 1, 10)
        aggs = []
        for i in range(3):
            aggs.append(_agg(date(2026, 1, 1 + i), stock=100 - i * 3,
                             event=EventType.SALES_LIKE, delta=-3))
        stock_after = 100 - 9
        for i in range(7):
            stock_after -= 5
            aggs.append(_agg(date(2026, 1, 4 + i), stock=stock_after,
                             event=EventType.ANOMALY_LIKE, delta=-5, excluded=True))

        # Без history: median = median([3,3,3]) = 3 → adj = (9 + 3*7)/10 = 3.0
        m_no = compute_metrics_for_sku(str(uuid4()), ps, pe, aggs, current_stock=stock_after)
        assert m_no.adjusted_velocity == pytest.approx(3.0, abs=0.01)

        # С history: pre-period median = 10 → adj = (9 + 10*7)/10 = 7.9
        m_with = compute_metrics_for_sku(
            str(uuid4()), ps, pe, aggs, current_stock=stock_after,
            history_for_median=[10.0, 10.0, 10.0, 10.0, 10.0, 10.0, 10.0],
        )
        assert m_with.adjusted_velocity == pytest.approx(7.9, abs=0.01)
        # Confirmed не зависит от history — должен быть одинаковый
        assert m_with.confirmed_velocity == m_no.confirmed_velocity

    def test_low_history_penalty_for_new_skus(self):
        """БАГ 4 FIX: SKU с <7 sales_like дней получает low_history penalty в confidence.

        Раньше SKU с 2 днями данных показывал 95% confidence (нет penalties),
        хотя выборка совершенно непредставительна. Теперь линейный штраф до -35.
        """
        ps, pe = date(2026, 1, 1), date(2026, 1, 10)
        # 2 sales_like дня + 8 no_change дней
        aggs = [
            _agg(date(2026, 1, 1), stock=98, event=EventType.SALES_LIKE, delta=-2),
            _agg(date(2026, 1, 2), stock=96, event=EventType.SALES_LIKE, delta=-2),
        ]
        for i in range(8):
            aggs.append(_agg(date(2026, 1, 3 + i), stock=96,
                             event=EventType.NO_CHANGE, delta=0))
        m = compute_metrics_for_sku(str(uuid4()), ps, pe, aggs, current_stock=96)
        # 2 sales_like → low_pen = 35 * (1 - 2/7) ≈ 25
        # Финальная confidence = 95 - 0 - 0 - 0 - 25 = 70
        assert 65 <= m.confidence_score <= 75
        # Breakdown должен показывать low_history штраф
        assert m.confidence_breakdown.low_history > 20

    def test_enough_history_no_low_history_penalty(self):
        """Sanity: при ≥ 7 sales_like дней low_history penalty = 0."""
        ps, pe = date(2026, 1, 1), date(2026, 1, 10)
        aggs = [
            _agg(date(2026, 1, 1 + i), stock=100 - i * 2,
                 event=EventType.SALES_LIKE, delta=-2)
            for i in range(10)
        ]
        m = compute_metrics_for_sku(str(uuid4()), ps, pe, aggs, current_stock=80)
        assert m.confidence_score == 95.0
        assert m.confidence_breakdown.low_history == 0.0

    def test_replenishment_in_middle_excluded_from_confirmed(self):
        """5 sales + 1 replenishment + 5 sales → replenishment day excluded."""
        ps, pe = date(2026, 1, 1), date(2026, 1, 11)
        aggs = []
        for i in range(5):
            aggs.append(_agg(date(2026, 1, 1 + i), stock=100 - i * 2,
                             event=EventType.SALES_LIKE, delta=-2))
        aggs.append(_agg(date(2026, 1, 6), stock=140,
                         event=EventType.REPLENISHMENT_LIKE, delta=+50, excluded=True))
        for i in range(5):
            aggs.append(_agg(date(2026, 1, 7 + i), stock=140 - (i + 1) * 2,
                             event=EventType.SALES_LIKE, delta=-2))
        m = compute_metrics_for_sku(str(uuid4()), ps, pe, aggs, current_stock=130)
        assert m.confirmed_velocity == pytest.approx(1.818, abs=0.01)
        assert m.in_stock_days == 11
        # 10 sales_like ≥ 7 → no low_history penalty. 1 repl/11 ≈ 9% → confidence ≈ 86
        assert 80 < m.confidence_score < 90

    def test_continuity_correction_with_no_excluded_in_stock(self):
        """Все sales — без excluded. adjusted == confirmed."""
        ps, pe = date(2026, 1, 1), date(2026, 1, 10)
        aggs = [
            _agg(date(2026, 1, 1 + i), stock=100 - i * 2,
                 event=EventType.SALES_LIKE, delta=-2)
            for i in range(10)
        ]
        m = compute_metrics_for_sku(str(uuid4()), ps, pe, aggs, current_stock=80)
        assert m.confirmed_velocity == pytest.approx(2.0)
        assert m.adjusted_velocity == pytest.approx(2.0)

    def test_continuity_correction_with_many_excluded(self):
        """3 sales + 7 anomaly_excluded → adjusted > confirmed (continuity boost).

        Confidence низкий: 7 anomaly + low_history.
        """
        ps, pe = date(2026, 1, 1), date(2026, 1, 10)
        aggs = []
        for i in range(3):
            aggs.append(_agg(date(2026, 1, 1 + i), stock=100 - i * 3,
                             event=EventType.SALES_LIKE, delta=-3))
        stock_after = 100 - 9
        for i in range(7):
            stock_after -= 5
            aggs.append(_agg(date(2026, 1, 4 + i), stock=stock_after,
                             event=EventType.ANOMALY_LIKE, delta=-5, excluded=True))
        m = compute_metrics_for_sku(str(uuid4()), ps, pe, aggs, current_stock=stock_after)
        assert m.confirmed_velocity == pytest.approx(0.9, abs=0.01)
        assert m.adjusted_velocity == pytest.approx(3.0, abs=0.01)
        assert m.adjusted_velocity > m.confirmed_velocity
        # 3 sales_like → low_pen ≈ 20, + anomaly 70% → confidence at floor
        assert m.confidence_score == 40.0

    def test_zero_period_zero_metrics(self):
        """Пустой список aggregates — всё нули."""
        ps, pe = date(2026, 1, 1), date(2026, 1, 1)
        m = compute_metrics_for_sku(str(uuid4()), ps, pe, [], current_stock=0)
        assert m.confirmed_velocity == 0.0
        assert m.adjusted_velocity == 0.0
        assert m.in_stock_days == 0
        assert m.stockout_days == 0

    def test_underestimated_sku_detection_in_pipeline(self):
        """Быстрые продажи + missing дни — для is_underestimated_sku нужен confidence >= 70.

        7 sales_like → low_pen = 0. 3 missing → -30. Финальная = 65.
        is_underestimated_sku в recalc.py требует >= 70, значит этот SKU не пометится.
        """
        ps, pe = date(2026, 1, 1), date(2026, 1, 10)
        aggs = []
        for i in range(7):
            aggs.append(_agg(date(2026, 1, 1 + i), stock=100 - i * 8,
                             event=EventType.SALES_LIKE, delta=-8))
        for i in range(3):
            aggs.append(_agg(date(2026, 1, 8 + i), stock=0,
                             event=EventType.MISSING_DATA, delta=None,
                             availability=False, excluded=True))
        m = compute_metrics_for_sku(str(uuid4()), ps, pe, aggs, current_stock=0)
        assert m.confirmed_velocity == pytest.approx(8.0)
        # stockout_days = 0 теперь (missing != stockout)
        assert m.stockout_days == 0
        # 7 sales + 3 missing/10 → 95 - 30 = 65
        assert m.confidence_score == 65.0

    def test_bracketed_missing_softened(self):
        """Перестраховка: MISSING-дни ВНУТРИ периода (после них есть реальные данные)
        штрафуются вполовину — провал миграции/даунтайма не валит confidence как
        настоящая хвостовая дыра.

        4 sales + 4 missing(внутри) + 2 sales = 10 дней. 4 «обрамлённых» missing × 0.5 = 2
        эффективных. missing_pen = 2/10×100 = 20 (а не 40). 6 sales_like < 7 → low_pen = 5.
        confidence = 95 − 20 − 5 = 70.
        """
        ps, pe = date(2026, 1, 1), date(2026, 1, 10)
        aggs = []
        for i in range(4):
            aggs.append(_agg(date(2026, 1, 1 + i), stock=100 - i * 2,
                             event=EventType.SALES_LIKE, delta=-2))
        for i in range(4):
            aggs.append(_agg(date(2026, 1, 5 + i), stock=92,
                             event=EventType.MISSING_DATA, delta=None,
                             availability=False, excluded=True))
        for i in range(2):
            aggs.append(_agg(date(2026, 1, 9 + i), stock=92 - (i + 1) * 2,
                             event=EventType.SALES_LIKE, delta=-2))
        m = compute_metrics_for_sku(str(uuid4()), ps, pe, aggs, current_stock=88)
        # 4 обрамлённых missing × 0.5 = 2 эфф. / 10 = 20%
        assert m.confidence_breakdown.missing_data == pytest.approx(20.0, abs=0.01)
        # 6 sales_like → low_pen = 35×(1−6/7) = 5
        assert m.confidence_breakdown.low_history == pytest.approx(5.0, abs=0.01)
        assert m.confidence_score == pytest.approx(70.0, abs=0.01)
