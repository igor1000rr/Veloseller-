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


# ============================================================================
# БАГ 51: проверка APP_URL в email/telegram links
# ============================================================================


def test_email_link_uses_app_url_env(monkeypatch):
    """БАГ 51: ссылка в email берётся из APP_URL env, не hardcoded."""
    monkeypatch.setenv("RESEND_API_KEY", "re_test_123")
    monkeypatch.setenv("APP_URL", "https://test-domain.example.com")
    mock_resend = MagicMock()
    with patch.dict("sys.modules", {"resend": mock_resend}):
        from app.notifications import send_alert_digest
        send_alert_digest("u@e.com", "Igor",
                          [{"kind": "low_stock", "message": "x", "products": {"sku": "S"}}])
    html = mock_resend.Emails.send.call_args[0][0]["html"]
    assert 'https://test-domain.example.com/dashboard/alerts' in html
    assert 'veloseller.app' not in html


def test_email_link_default_to_veloseller_ru(monkeypatch):
    """Если APP_URL не задан — дефолт veloseller.ru."""
    monkeypatch.setenv("RESEND_API_KEY", "re_test_123")
    monkeypatch.delenv("APP_URL", raising=False)
    mock_resend = MagicMock()
    with patch.dict("sys.modules", {"resend": mock_resend}):
        from app.notifications import send_alert_digest
        send_alert_digest("u@e.com", "Igor",
                          [{"kind": "low_stock", "message": "x", "products": {"sku": "S"}}])
    html = mock_resend.Emails.send.call_args[0][0]["html"]
    assert 'https://veloseller.ru/dashboard/alerts' in html


# ============================================================================
# БАГ 20: HTML injection защита в email digest
# ============================================================================


class TestHtmlEscape:
    """User-provided strings экранируются перед вставкой в HTML."""

    def _send(self, monkeypatch, alerts, seller_name="Igor"):
        monkeypatch.setenv("RESEND_API_KEY", "re_test_123")
        mock_resend = MagicMock()
        with patch.dict("sys.modules", {"resend": mock_resend}):
            from app.notifications import send_alert_digest
            send_alert_digest("u@e.com", seller_name, alerts)
        return mock_resend.Emails.send.call_args[0][0]["html"]

    def test_sku_with_html_tags_escaped(self, monkeypatch):
        """SKU '<img src=x onerror=alert(1)>' не должен попадать в HTML живым."""
        alerts = [{"kind": "low_stock", "message": "x",
                   "products": {"sku": "<img src=x onerror=alert(1)>"}}]
        html = self._send(monkeypatch, alerts)
        assert "<img src=x" not in html
        assert "&lt;img src=x" in html

    def test_message_with_script_escaped(self, monkeypatch):
        alerts = [{"kind": "low_stock",
                   "message": "<script>alert('xss')</script>",
                   "products": {"sku": "OK"}}]
        html = self._send(monkeypatch, alerts)
        assert "<script>" not in html
        assert "&lt;script&gt;" in html

    def test_seller_name_with_html_escaped(self, monkeypatch):
        alerts = [{"kind": "low_stock", "message": "x", "products": {"sku": "S"}}]
        html = self._send(monkeypatch, alerts, seller_name="<b>Igor</b>")
        assert "<b>Igor</b>" not in html
        assert "&lt;b&gt;Igor&lt;/b&gt;" in html

    def test_ampersand_escaped(self, monkeypatch):
        alerts = [{"kind": "low_stock", "message": "Tom & Jerry",
                   "products": {"sku": "A&B"}}]
        html = self._send(monkeypatch, alerts)
        assert "A&amp;B" in html
        assert "Tom &amp; Jerry" in html


# ============================================================================
# БАГ 21: HTML injection защита в Telegram digest
# ============================================================================


class TestTelegramHtmlEscape:
    """Telegram parse_mode=HTML — sku и message экранируются."""

    def test_sku_with_link_escaped(self):
        from app.telegram import format_alerts_digest
        alerts = [{
            "kind": "low_stock",
            "message": "ok",
            "products": {"sku": '<a href="http://evil.com">click</a>'},
        }]
        result = format_alerts_digest(alerts)
        assert '<a href="http://evil.com">' not in result
        assert "&lt;a href=" in result

    def test_message_with_bold_escaped(self):
        from app.telegram import format_alerts_digest
        alerts = [{"kind": "low_stock",
                   "message": "<b>BOLD</b>",
                   "products": {"sku": "OK"}}]
        result = format_alerts_digest(alerts)
        assert "<b>BOLD</b>" not in result
        assert "&lt;b&gt;BOLD" in result

    def test_legitimate_html_kept(self, monkeypatch):
        """Наши собственные <b>, <code>, <a> в шаблоне остаются.

        БАГ 51: ссылка теперь из APP_URL env.
        """
        monkeypatch.setenv("APP_URL", "https://veloseller.ru")
        from app.telegram import format_alerts_digest
        alerts = [{"kind": "low_stock", "message": "x", "products": {"sku": "OK"}}]
        result = format_alerts_digest(alerts)
        assert "<b>Veloseller" in result
        assert "<code>OK</code>" in result
        assert '<a href="https://veloseller.ru/dashboard/alerts"' in result
