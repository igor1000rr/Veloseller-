"""Тесты notifications.send_report_email — универсальная отправка XLSX с
динамическим списком kinds в HTML body.

Правка Пункт 1 (25.05.2026): send_report_email возвращает
tuple[bool, Optional[str]].

Обновлено 01.06.2026 (Veloseller_Отчёт.txt): лейблы переименованы.
"""
import base64
from unittest.mock import MagicMock, patch


class TestSendReportEmail:
    def _send(self, monkeypatch, mock_resend_id="resend-id-123", **overrides):
        """Хелпер: вызвать send_report_email с моком resend."""
        monkeypatch.setenv("RESEND_API_KEY", "re_test_123")
        params = {
            "to_email": "seller@example.com",
            "seller_name": "Igor",
            "kinds": ["critical_stock", "dead_inventory"],
            "sku_counts": {"critical_stock": 5, "dead_inventory": 12},
            "xlsx_bytes": b"PK\x03\x04fake-xlsx",
            "filename": "veloseller-otchet-2026-05-25.xlsx",
            **overrides,
        }
        mock_resend = MagicMock()
        mock_resend.Emails.send.return_value = {"id": mock_resend_id}
        with patch.dict("sys.modules", {"resend": mock_resend}):
            from app.notifications import send_report_email
            result = send_report_email(**params)
        success = result[0] if isinstance(result, tuple) else result
        payload = mock_resend.Emails.send.call_args[0][0] if success else None
        return result, payload

    def test_no_api_key_returns_false(self, monkeypatch):
        monkeypatch.delenv("RESEND_API_KEY", raising=False)
        from app.notifications import send_report_email
        result = send_report_email(
            to_email="u@e.com", seller_name="I",
            kinds=["critical_stock"], sku_counts={"critical_stock": 1},
            xlsx_bytes=b"x", filename="f.xlsx",
        )
        assert result == (False, "RESEND_API_KEY not configured")

    def test_success_attaches_xlsx(self, monkeypatch):
        xlsx = b"PK\x03\x04test-content-here"
        result, payload = self._send(monkeypatch, xlsx_bytes=xlsx,
                                     filename="my-report.xlsx")
        assert result == (True, None)
        assert payload["subject"].startswith("Veloseller — Отчёт от")
        assert len(payload["attachments"]) == 1
        att = payload["attachments"][0]
        assert att["filename"] == "my-report.xlsx"
        assert base64.b64decode(att["content"]) == xlsx

    def test_html_lists_kinds_with_counts(self, monkeypatch):
        """В HTML body должны быть лейблы kinds с количеством SKU.

        Александр 01.06.2026: dead_inventory → "Замороженные остатки",
        underestimated_sku → "Потерянные продажи".
        """
        result, payload = self._send(monkeypatch,
            kinds=["critical_stock", "dead_inventory"],
            sku_counts={"critical_stock": 5, "dead_inventory": 12},
        )
        assert result == (True, None)
        html = payload["html"]
        assert "Критический остаток" in html
        assert "5 SKU" in html
        # Бывш. "Неликвид"
        assert "Замороженные остатки" in html
        assert "12 SKU" in html

    def test_lost_sales_label(self, monkeypatch):
        """underestimated_sku → "Потерянные продажи" в email body."""
        result, payload = self._send(monkeypatch,
            kinds=["underestimated_sku"],
            sku_counts={"underestimated_sku": 8},
        )
        html = payload["html"]
        assert "Потерянные продажи" in html
        assert "8 SKU" in html

    def test_weekly_report_shown_without_sku_count(self, monkeypatch):
        """weekly_report — это HEAD-страница сводки, не SKU. В письме без счёта.

        Александр 01.06.2026: сводка показывается просто как лист без " — N SKU".
        """
        result, payload = self._send(monkeypatch,
            kinds=["weekly_report"],
            sku_counts={"weekly_report": 1},
        )
        html = payload["html"]
        assert "Сводка по складу" in html
        # Не должно быть " — 1 SKU" т.к. weekly_report не про SKU
        assert "1 SKU" not in html

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
        assert '/dashboard/alerts/subscriptions' in payload["html"]

    def test_kinds_with_zero_count_not_in_list(self, monkeypatch):
        """Если у kind 0 SKU — он не показывается в HTML списке."""
        _, payload = self._send(monkeypatch,
            kinds=["critical_stock", "dead_inventory"],
            sku_counts={"critical_stock": 5, "dead_inventory": 0},
        )
        html = payload["html"]
        assert "Критический остаток" in html
        # dead_inventory с 0 SKU не должен попадать в <li>
        assert "Замороженные остатки" not in html

    def test_unknown_kind_falls_back_to_raw(self, monkeypatch):
        """Если в kinds попал неизвестный kind — выводим как есть, не падаем."""
        _, payload = self._send(monkeypatch,
            kinds=["custom_kind"],
            sku_counts={"custom_kind": 3},
        )
        html = payload["html"]
        assert "custom_kind" in html

    def test_resend_exception_returns_false_with_error_text(self, monkeypatch):
        """Resend бросил exception — возвращаем (False, '{ExceptionType}: text')."""
        monkeypatch.setenv("RESEND_API_KEY", "re_test_123")
        mock_resend = MagicMock()
        mock_resend.Emails.send.side_effect = Exception("resend down")
        with patch.dict("sys.modules", {"resend": mock_resend}):
            from app.notifications import send_report_email
            result = send_report_email(
                to_email="u@e.com", seller_name="I",
                kinds=["critical_stock"], sku_counts={"critical_stock": 1},
                xlsx_bytes=b"x", filename="f.xlsx",
            )
        assert isinstance(result, tuple)
        success, err = result
        assert success is False
        assert err is not None
        assert "Exception" in err
        assert "resend down" in err

    def test_no_message_id_returns_false(self, monkeypatch):
        """Resend вернул объект без id (странный edge case) → (False, '...')."""
        monkeypatch.setenv("RESEND_API_KEY", "re_test_123")
        mock_resend = MagicMock()
        mock_resend.Emails.send.return_value = {"some_other_field": "value"}
        with patch.dict("sys.modules", {"resend": mock_resend}):
            from app.notifications import send_report_email
            result = send_report_email(
                to_email="u@e.com", seller_name="I",
                kinds=["critical_stock"], sku_counts={"critical_stock": 1},
                xlsx_bytes=b"x", filename="f.xlsx",
            )
        success, err = result
        assert success is False
        assert err is not None
        assert "no message id" in err
