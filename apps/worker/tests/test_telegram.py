"""Тесты telegram.py — Bot API wrapper."""
from unittest.mock import patch, MagicMock
import pytest


@pytest.fixture(autouse=True)
def _telegram_token(monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "test-token-12345")


def test_send_message_no_token(monkeypatch):
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    from app.telegram import send_message
    assert send_message("123", "hello") is False


def test_send_message_no_chat_id():
    from app.telegram import send_message
    assert send_message("", "hello") is False


def test_send_message_success():
    from app.telegram import send_message
    mock_response = MagicMock(status_code=200)
    with patch("app.telegram.httpx.post", return_value=mock_response) as post:
        assert send_message("123", "<b>test</b>") is True
        assert "test-token-12345" in post.call_args[0][0]
        assert "sendMessage" in post.call_args[0][0]


def test_send_message_api_error():
    from app.telegram import send_message
    mock_response = MagicMock(status_code=400, text="Bad request")
    with patch("app.telegram.httpx.post", return_value=mock_response):
        assert send_message("123", "test") is False


def test_send_message_network_error():
    from app.telegram import send_message
    with patch("app.telegram.httpx.post", side_effect=Exception("net")):
        assert send_message("123", "test") is False


def test_format_alerts_empty():
    from app.telegram import format_alerts_digest
    assert format_alerts_digest([]) == ""


def test_format_alerts_basic():
    from app.telegram import format_alerts_digest
    alerts = [
        {"kind": "critical_stock", "message": "SKU-A осталось 1 шт", "products": {"sku": "SKU-A"}},
        {"kind": "low_stock", "message": "SKU-B заканчивается", "products": {"sku": "SKU-B"}},
    ]
    out = format_alerts_digest(alerts)
    assert "Veloseller" in out
    assert "SKU-A" in out
    assert "SKU-B" in out
    assert "\U0001f534" in out
    assert "\U0001f7e1" in out


def test_format_alerts_truncation():
    from app.telegram import format_alerts_digest
    alerts = [
        {"kind": "low_stock", "message": f"msg-{i}", "products": {"sku": f"S{i}"}}
        for i in range(30)
    ]
    out = format_alerts_digest(alerts)
    assert "ещё 10" in out


def test_format_alerts_products_as_list():
    from app.telegram import format_alerts_digest
    alerts = [{"kind": "low_stock", "message": "x", "products": [{"sku": "SKU"}]}]
    out = format_alerts_digest(alerts)
    assert "SKU" in out
