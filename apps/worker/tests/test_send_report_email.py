"""Тесты notifications.send_report_email — универсальная отправка XLSX с
динамическим списком kinds в HTML body.

Дополняет test_notifications.py — там покрыт старый send_weekly_report_email.
"""
import base64
from unittest.mock import MagicMock, patch


class TestSendReportEmail:
    def _send(self, monkeypatch, **overrides):
        monkeypatch.setenv("RESEND_API_KEY", "re_test_123")
        params = {
            "to_email": "seller@example.com",
            "seller_name": "Igor",
            "kinds": ["low_stock", "dead_inventory"],
            "sku_counts": {"low_stock": 5, "dead_inventory": 12},
            "xlsx_bytes": b"PK\x03\x04fake-xlsx",
            "filename": "veloseller-otchet-2026-05-25.xlsx",
            **overrides,
        }
        mock_resend = MagicMock()
        with patch.dict("sys.modules", {"resend": mock_resend}):
            from app.notifications import send_report_email
            result = send_report_email(**params)
        payload = mock_resend.Emails.send.call_args[0][0] if result else None
        return result, payload

    def test_no_api_key_returns_false(self, monkeypatch):
        monkeypatch.delenv("RESEND_API_KEY", raising=False)
        from app.notifications import send_report_email
        result = send_report_email(
            to_email="u@e.com", seller_name="I",
            kinds=["low_stock"], sku_counts={"low_stock": 1},
            xlsx_bytes=b"x", filename="f.xlsx",
        )
        assert result is False

    def test_success_attaches_xlsx(self, monkeypatch):
        xlsx = b"PK\x03\x04test-content-here"
        result, payload = self._send(monkeypatch, xlsx_bytes=xlsx,
                                     filename="my-report.xlsx")
        assert result is True
        assert payload["subject"].startswith("Veloseller — Отчёт от")
        assert len(payload["attachments"]) == 1
        att = payload["attachments"][0]
        assert att["filename"] == "my-report.xlsx"
        assert base64.b64decode(att["content"]) == xlsx

    def test_html_lists_kinds_with_counts(self, monkeypatch):
        """В HTML body должны быть лейблы kinds с количеством SKU."""
        result, payload = self._send(monkeypatch,
            kinds=["low_stock", "dead_inventory"],
            sku_counts={"low_stock": 5, "dead_inventory": 12},
        )
        html = payload["html"]
        assert "Низкий остаток" in html
        assert "5 SKU" in html
        assert "Неликвид" in html
        assert "12 SKU" in html

    def test_seller_name_escaped(self, monkeypatch):
        """<script> в имени экранируется."""
        _, payload = self._send(monkeypatch, seller_name="<script>x</script>")
        assert "<script>x</script>" not in payload["html"]
        assert "&lt;script&gt;" in payload["html"]

    def test_cta_link_to_alerts_history(self, monkeypatch):
        """В письме кнопка ведёт на /dashboard/alerts (история)."""
        monkeypatch.setenv("APP_URL", "https://veloseller.ru")
        _, payload = self._send(monkeypatch)
        assert 'https://veloseller.ru/dashboard/alerts' in payload["html"]
        # И ссылка на настройки внизу
        assert '/dashboard/alerts/subscriptions' in payload["html"]

    def test_kinds_with_zero_count_not_in_list(self, monkeypatch):
        """Если у kind 0 SKU — он не показывается в HTML списке (лист всё равно пропущен)."""
        _, payload = self._send(monkeypatch,
            kinds=["low_stock", "sync_error"],
            sku_counts={"low_stock": 5, "sync_error": 0},
        )
        html = payload["html"]
        assert "Низкий остаток" in html
        # sync_error с 0 SKU не должен попадать в <li>
        assert "Ошибки синхронизации" not in html

    def test_unknown_kind_falls_back_to_raw(self, monkeypatch):
        """Если в kinds попал неизвестный kind — выводим как есть, не падаем."""
        _, payload = self._send(monkeypatch,
            kinds=["custom_kind"],
            sku_counts={"custom_kind": 3},
        )
        html = payload["html"]
        assert "custom_kind" in html

    def test_resend_exception_returns_false(self, monkeypatch):
        monkeypatch.setenv("RESEND_API_KEY", "re_test_123")
        mock_resend = MagicMock()
        mock_resend.Emails.send.side_effect = Exception("resend down")
        with patch.dict("sys.modules", {"resend": mock_resend}):
            from app.notifications import send_report_email
            result = send_report_email(
                to_email="u@e.com", seller_name="I",
                kinds=["low_stock"], sku_counts={"low_stock": 1},
                xlsx_bytes=b"x", filename="f.xlsx",
            )
        assert result is False
