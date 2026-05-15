"""Тесты sources/google_sheet.py с mock'ом gspread.

fetch_snapshots использует ленивые импорты (gspread, google.oauth2) — поэтому
мокаем их через sys.modules перед вызовом функции.
"""
from __future__ import annotations
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture
def mock_gspread_modules(monkeypatch, tmp_path):
    """Мокает gspread и google.oauth2.service_account до lazy-импорта."""
    # Создаём пустой service-account JSON для Credentials.from_service_account_file
    fake_creds = tmp_path / "sa.json"
    fake_creds.write_text('{"type":"service_account","project_id":"x"}')
    monkeypatch.setattr("app.config.settings.google_application_credentials", str(fake_creds))

    mock_gspread = MagicMock()
    mock_oauth = MagicMock()
    mock_oauth.Credentials = MagicMock()

    monkeypatch.setitem(__import__("sys").modules, "gspread", mock_gspread)
    monkeypatch.setitem(__import__("sys").modules, "google.oauth2.service_account", mock_oauth)

    return mock_gspread, mock_oauth


class TestGoogleSheetFetch:
    def test_parses_rows_correctly(self, mock_gspread_modules):
        mock_gs, _ = mock_gspread_modules
        mock_ws = MagicMock()
        mock_ws.get_all_records.return_value = [
            {"sku": "A1", "product_name": "Item A", "stock_quantity": 10, "price": "100.50"},
            {"sku": "B2", "product_name": "", "stock_quantity": 5, "price": "200,00"},  # запятая
        ]
        mock_sheet = MagicMock()
        mock_sheet.get_worksheet.return_value = mock_ws
        mock_client = MagicMock()
        mock_client.open_by_key.return_value = mock_sheet
        mock_gs.authorize.return_value = mock_client

        from app.sources.google_sheet import fetch_snapshots
        snaps = fetch_snapshots("sheet-key-abc")

        assert len(snaps) == 2
        assert snaps[0].sku == "A1"
        assert snaps[0].product_name == "Item A"
        assert snaps[0].stock_quantity == 10
        assert snaps[0].price == Decimal("100.50")

        # Запятая в цене конвертируется в точку
        assert snaps[1].sku == "B2"
        assert snaps[1].product_name is None  # пустая строка → None
        assert snaps[1].price == Decimal("200.00")

    def test_url_vs_key_dispatch(self, mock_gspread_modules):
        """URL → open_by_url, key → open_by_key."""
        mock_gs, _ = mock_gspread_modules
        mock_ws = MagicMock()
        mock_ws.get_all_records.return_value = []
        mock_sheet = MagicMock()
        mock_sheet.get_worksheet.return_value = mock_ws
        mock_client = MagicMock()
        mock_client.open_by_url.return_value = mock_sheet
        mock_client.open_by_key.return_value = mock_sheet
        mock_gs.authorize.return_value = mock_client

        from app.sources.google_sheet import fetch_snapshots
        fetch_snapshots("https://docs.google.com/spreadsheets/d/abc/edit")
        mock_client.open_by_url.assert_called_once()
        mock_client.open_by_key.assert_not_called()

        mock_client.reset_mock()
        fetch_snapshots("abc-key-only")
        mock_client.open_by_key.assert_called_once()
        mock_client.open_by_url.assert_not_called()

    def test_case_insensitive_headers(self, mock_gspread_modules):
        """Шапка может быть в любом регистре: SKU, Stock_Quantity, PRICE."""
        mock_gs, _ = mock_gspread_modules
        mock_ws = MagicMock()
        mock_ws.get_all_records.return_value = [
            {"SKU": "X", "Stock_Quantity": 7, "PRICE": "50"},
        ]
        mock_sheet = MagicMock()
        mock_sheet.get_worksheet.return_value = mock_ws
        mock_client = MagicMock()
        mock_client.open_by_key.return_value = mock_sheet
        mock_gs.authorize.return_value = mock_client

        from app.sources.google_sheet import fetch_snapshots
        snaps = fetch_snapshots("key")
        assert len(snaps) == 1
        assert snaps[0].sku == "X"
        assert snaps[0].stock_quantity == 7
        assert snaps[0].price == Decimal("50")

    def test_worksheet_index_passed(self, mock_gspread_modules):
        """worksheet_index=2 передаётся в get_worksheet."""
        mock_gs, _ = mock_gspread_modules
        mock_ws = MagicMock()
        mock_ws.get_all_records.return_value = []
        mock_sheet = MagicMock()
        mock_sheet.get_worksheet.return_value = mock_ws
        mock_client = MagicMock()
        mock_client.open_by_key.return_value = mock_sheet
        mock_gs.authorize.return_value = mock_client

        from app.sources.google_sheet import fetch_snapshots
        fetch_snapshots("key", worksheet_index=2)
        mock_sheet.get_worksheet.assert_called_once_with(2)

    def test_empty_sheet_returns_empty(self, mock_gspread_modules):
        """Пустой лист → пустой список snapshots."""
        mock_gs, _ = mock_gspread_modules
        mock_ws = MagicMock()
        mock_ws.get_all_records.return_value = []
        mock_sheet = MagicMock()
        mock_sheet.get_worksheet.return_value = mock_ws
        mock_client = MagicMock()
        mock_client.open_by_key.return_value = mock_sheet
        mock_gs.authorize.return_value = mock_client

        from app.sources.google_sheet import fetch_snapshots
        assert fetch_snapshots("key") == []
