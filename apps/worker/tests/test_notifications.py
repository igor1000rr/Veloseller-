"""Тесты notifications.py — email digest через Resend."""
from unittest.mock import patch, MagicMock


def test_send_no_api_key(monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    from app.notifications import send_alert_digest
    assert send_alert_digest("user@example.com", "Igor", [{"kind": "low_stock", "message": "x", "products": {"sku": "S"}}]) is False


def test_send_empty_alerts(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_test_123")
    from app.notifications import send_alert_digest
    assert send_alert_digest("user@example.com", "Igor", []) is False


def test_send_success(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_test_123")
    monkeypatch.setenv("RESEND_FROM", "Veloseller <test@test.com>")

    alerts = [
        {"kind": "critical_stock", "message": "Закончится завтра", "products": {"sku": "SKU-A"}},
        {"kind": "dead_inventory",  "message": "Лежит 300 дней",  "products": {"sku": "SKU-B"}},
    ]

    mock_emails = MagicMock()
    mock_resend = MagicMock(Emails=mock_emails)
    with patch.dict("sys.modules", {"resend": mock_resend}):
        from app.notifications import send_alert_digest
        result = send_alert_digest("user@example.com", "Igor", alerts)

    assert result is True
    call_args = mock_emails.send.call_args[0][0]
    assert call_args["to"] == ["user@example.com"]
    assert "Veloseller" in call_args["from"]
    assert "2 новых уведомлений" in call_args["subject"]
    html = call_args["html"]
    assert "SKU-A" in html and "SKU-B" in html
    assert "Igor" in html


def test_send_no_seller_name(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_test_123")
    mock_resend = MagicMock()
    with patch.dict("sys.modules", {"resend": mock_resend}):
        from app.notifications import send_alert_digest
        send_alert_digest("u@e.com", None,
                          [{"kind": "low_stock", "message": "x", "products": {"sku": "S"}}])
    html = mock_resend.Emails.send.call_args[0][0]["html"]
    assert "Привет!" in html


def test_send_api_error(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_test_123")
    mock_resend = MagicMock()
    mock_resend.Emails.send.side_effect = Exception("API down")
    with patch.dict("sys.modules", {"resend": mock_resend}):
        from app.notifications import send_alert_digest
        result = send_alert_digest("u@e.com", "I",
                                    [{"kind": "low_stock", "message": "x", "products": {"sku": "S"}}])
    assert result is False
