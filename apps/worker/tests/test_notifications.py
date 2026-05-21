"""Тесты notifications.py — email digest через Resend."""
import base64
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


# ============================================================================
# send_sync_error_notification — email об ошибке sync склада
# ============================================================================


class TestSyncErrorNotification:
    """Покрываем send_sync_error_notification — отправка email о падении sync."""

    def test_no_api_key_returns_false(self, monkeypatch):
        monkeypatch.delenv("RESEND_API_KEY", raising=False)
        from app.notifications import send_sync_error_notification
        result = send_sync_error_notification(
            to_email="u@e.com", warehouse_name="Склад 1",
            warehouse_kind="ozon_fbo", error_message="timeout",
            failure_count=1, auto_paused=False,
        )
        assert result is False

    def _send(self, monkeypatch, **overrides):
        """Helper: отправляет sync-error и возвращает кортеж (result, email_payload)."""
        monkeypatch.setenv("RESEND_API_KEY", "re_test_123")
        params = {
            "to_email": "seller@example.com",
            "warehouse_name": "Основной склад",
            "warehouse_kind": "ozon_fbo",
            "error_message": "connection timeout",
            "failure_count": 1,
            "auto_paused": False,
            **overrides,
        }
        mock_resend = MagicMock()
        with patch.dict("sys.modules", {"resend": mock_resend}):
            from app.notifications import send_sync_error_notification
            result = send_sync_error_notification(**params)
        payload = mock_resend.Emails.send.call_args[0][0] if result else None
        return result, payload

    def test_warning_email_when_not_paused(self, monkeypatch):
        """auto_paused=False — warning без слов 'поставлен на паузу'."""
        result, payload = self._send(monkeypatch, auto_paused=False, failure_count=2)
        assert result is True
        # В коде: subject = f"⚠ Veloseller: ошибка синхронизации склада «{warehouse_name}»"
        assert "ошибка синхронизации" in payload["subject"]
        assert "Основной склад" in payload["subject"]
        html = payload["html"]
        # headline в html: "Ошибка синхронизации склада «Основной склад»" (с большой)
        assert "Ошибка синхронизации" in html
        assert "произошла ошибка" in html
        assert "поставлен на паузу" not in html
        assert "Ozon FBO" in html
        assert "<b>2</b>" in html

    def test_paused_email_when_auto_paused(self, monkeypatch):
        """auto_paused=True — красный alert, 'поставлен на паузу'."""
        result, payload = self._send(monkeypatch, auto_paused=True, failure_count=3)
        assert result is True
        assert "паузу" in payload["subject"]
        html = payload["html"]
        assert "поставлен на паузу" in html
        assert "3 раз подряд" in html

    def test_warehouse_name_html_escaped(self, monkeypatch):
        """БАГ: warehouse_name '<script>' должен экранироваться."""
        result, payload = self._send(monkeypatch, warehouse_name="<script>alert(1)</script>")
        html = payload["html"]
        assert "<script>alert(1)" not in html
        assert "&lt;script&gt;" in html

    def test_error_message_html_escaped(self, monkeypatch):
        """БАГ: error_message '<b>HACK</b>' должен экранироваться."""
        result, payload = self._send(monkeypatch, error_message="<b>HACK</b> attempt")
        html = payload["html"]
        assert "<b>HACK</b>" not in html
        assert "&lt;b&gt;HACK&lt;/b&gt;" in html

    def test_error_message_truncated_to_500(self, monkeypatch):
        """error_message больше 500 символов обрезается в HTML."""
        long_err = "A" * 1000
        result, payload = self._send(monkeypatch, error_message=long_err)
        html = payload["html"]
        # В HTML должны пойти только первые 500 "A".
        # Другие "A" в шаблоне (typography, font names) могут быть, поэтому с запасом.
        count = html.count("A")
        assert 500 <= count <= 520, f"Ожидали ~500 A в html, получили {count}"

    def test_warehouse_kind_label_mapping(self, monkeypatch):
        """Различные warehouse_kind правильно разворачиваются в читаемые label."""
        for kind, label in [
            ("ozon_fbo", "Ozon FBO"),
            ("ozon_fbs", "Ozon FBS"),
            ("wb_fbo", "Wildberries FBO"),
            ("wb_fbs", "Wildberries FBS"),
            ("google_sheet", "Google Sheet"),
        ]:
            _, payload = self._send(monkeypatch, warehouse_kind=kind)
            assert label in payload["html"]

    def test_unknown_warehouse_kind_falls_back_to_raw(self, monkeypatch):
        """Неизвестный warehouse_kind — отображаем как есть."""
        _, payload = self._send(monkeypatch, warehouse_kind="custom_kind")
        assert "custom_kind" in payload["html"]

    def test_resend_exception_returns_false(self, monkeypatch):
        """Resend бросил — возвращаем False, не падаем."""
        monkeypatch.setenv("RESEND_API_KEY", "re_test_123")
        mock_resend = MagicMock()
        mock_resend.Emails.send.side_effect = Exception("network error")
        with patch.dict("sys.modules", {"resend": mock_resend}):
            from app.notifications import send_sync_error_notification
            result = send_sync_error_notification(
                to_email="u@e.com", warehouse_name="X",
                warehouse_kind="ozon_fbo", error_message="err",
                failure_count=1, auto_paused=False,
            )
        assert result is False


# ============================================================================
# send_weekly_report_email — еженедельный Excel отчёт
# ============================================================================


class TestWeeklyReportEmail:
    """Покрываем send_weekly_report_email — отправка xlsx attachment."""

    def test_no_api_key_returns_false(self, monkeypatch):
        monkeypatch.delenv("RESEND_API_KEY", raising=False)
        from app.notifications import send_weekly_report_email
        result = send_weekly_report_email(
            to_email="u@e.com", seller_name="Igor",
            xlsx_bytes=b"fake-xlsx-content", filename="report.xlsx",
        )
        assert result is False

    def _send(self, monkeypatch, **overrides):
        monkeypatch.setenv("RESEND_API_KEY", "re_test_123")
        params = {
            "to_email": "seller@example.com",
            "seller_name": "Igor",
            "xlsx_bytes": b"PK\x03\x04fake-xlsx",
            "filename": "weekly-2026-W21.xlsx",
            **overrides,
        }
        mock_resend = MagicMock()
        with patch.dict("sys.modules", {"resend": mock_resend}):
            from app.notifications import send_weekly_report_email
            result = send_weekly_report_email(**params)
        payload = mock_resend.Emails.send.call_args[0][0] if result else None
        return result, payload

    def test_success_attaches_xlsx(self, monkeypatch):
        """xlsx прилагается к письму как base64."""
        xlsx = b"PK\x03\x04this-is-fake-xlsx-content"
        result, payload = self._send(monkeypatch, xlsx_bytes=xlsx, filename="my-report.xlsx")
        assert result is True
        assert "еженедельный отчёт" in payload["subject"].lower()
        assert len(payload["attachments"]) == 1
        att = payload["attachments"][0]
        assert att["filename"] == "my-report.xlsx"
        # Декодируем и сравниваем оригинальные байты
        assert base64.b64decode(att["content"]) == xlsx

    def test_seller_name_in_html(self, monkeypatch):
        """seller_name выводится в приветствии."""
        result, payload = self._send(monkeypatch, seller_name="Александр")
        assert "Привет, Александр!" in payload["html"]

    def test_no_seller_name_falls_back(self, monkeypatch):
        """Без seller_name — просто 'Привет!'."""
        result, payload = self._send(monkeypatch, seller_name=None)
        assert "Привет!" in payload["html"]

    def test_seller_name_html_escaped(self, monkeypatch):
        """seller_name экранируется в HTML."""
        result, payload = self._send(monkeypatch, seller_name="<img src=x>")
        html = payload["html"]
        assert "<img src=x>" not in html
        assert "&lt;img src=x&gt;" in html

    def test_resend_exception_returns_false(self, monkeypatch):
        """Resend бросил — возвращаем False."""
        monkeypatch.setenv("RESEND_API_KEY", "re_test_123")
        mock_resend = MagicMock()
        mock_resend.Emails.send.side_effect = Exception("resend down")
        with patch.dict("sys.modules", {"resend": mock_resend}):
            from app.notifications import send_weekly_report_email
            result = send_weekly_report_email(
                to_email="u@e.com", seller_name="I",
                xlsx_bytes=b"x", filename="f.xlsx",
            )
        assert result is False

    def test_uses_app_url_for_dashboard_link(self, monkeypatch):
        """Ссылка на дашборд из APP_URL env."""
        monkeypatch.setenv("APP_URL", "https://custom.example.com")
        result, payload = self._send(monkeypatch)
        assert 'https://custom.example.com/dashboard' in payload["html"]
