"""Тесты engine/changelog.py — человекочитаемые сообщения событий."""
from app.engine.changelog import event_message
from app.schemas import EventType


def test_first_snapshot():
    msg, impact = event_message(EventType.FIRST_SNAPSHOT, None)
    assert "первое подключение" in msg.lower() or "точка отсчёта" in msg.lower()
    assert impact == 0.0


def test_no_change():
    msg, impact = event_message(EventType.NO_CHANGE, None)
    assert impact == 0.0


def test_sales_like_with_delta():
    msg, impact = event_message(EventType.SALES_LIKE, -5)
    assert "продажа" in msg.lower()
    assert "-5" in msg
    assert impact == 0.0


def test_replenishment_negative_impact():
    msg, impact = event_message(EventType.REPLENISHMENT_LIKE, 100)
    assert "пополнение" in msg.lower()
    assert "+100" in msg
    assert impact < 0


def test_anomaly_negative_impact():
    msg, impact = event_message(EventType.ANOMALY_LIKE, -50)
    assert "аномалия" in msg.lower()
    assert impact < 0


def test_missing_data_no_delta():
    msg, impact = event_message(EventType.MISSING_DATA, None)
    assert "нет данных" in msg.lower()
    assert impact < 0


def test_recount_like():
    msg, impact = event_message(EventType.RECOUNT_LIKE, -10)
    assert "инвентаризац" in msg.lower() or "пересчёт" in msg.lower()
    assert impact < 0
