"""Тесты вспомогательных функций jobs/recalc.py."""
from app.jobs.recalc import _event_message, _confidence_impact
from app.schemas import EventType


def test_event_message_sales_like():
    assert "Продажа" in _event_message(EventType.SALES_LIKE, -5)
    assert "5" in _event_message(EventType.SALES_LIKE, -5)


def test_event_message_replenishment():
    msg = _event_message(EventType.REPLENISHMENT_LIKE, 100)
    assert "Пополнение" in msg
    assert "100" in msg


def test_event_message_anomaly():
    msg = _event_message(EventType.ANOMALY_LIKE, -50)
    assert "Аномалия" in msg


def test_event_message_missing_data():
    msg = _event_message(EventType.MISSING_DATA, None)
    assert "Нет данных" in msg


def test_event_message_first_snapshot():
    msg = _event_message(EventType.FIRST_SNAPSHOT, None)
    assert "Первый снимок" in msg or "снимок" in msg.lower()


def test_event_message_no_change():
    msg = _event_message(EventType.NO_CHANGE, 0)
    assert "Без изменений" in msg


def test_event_message_recount_fallback():
    """Recount возвращает str(et.value) — fallback ветка."""
    msg = _event_message(EventType.RECOUNT_LIKE, -10)
    assert msg  # не пустое


def test_confidence_impact_negative_events():
    """Replenishment / anomaly / missing_data — отрицательное влияние."""
    assert _confidence_impact(EventType.REPLENISHMENT_LIKE) < 0
    assert _confidence_impact(EventType.ANOMALY_LIKE) < 0
    assert _confidence_impact(EventType.MISSING_DATA) < 0


def test_confidence_impact_zero_for_neutral():
    """Sales_like / no_change / first_snapshot — без влияния (0.0)."""
    assert _confidence_impact(EventType.SALES_LIKE) == 0.0
    assert _confidence_impact(EventType.NO_CHANGE) == 0.0
    assert _confidence_impact(EventType.FIRST_SNAPSHOT) == 0.0
