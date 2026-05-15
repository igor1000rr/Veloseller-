"""Mock-тесты парсеров marketplace API на реальных форматах ответов.

Ozon: docs.ozon.ru/api/seller/ (v3/product/list + v4/product/info/stocks)
Wildberries: openapi.wildberries.ru/statistics/api/ru/ (supplier/stocks)
Покрываем:
  - базовый ответ → правильный SnapshotInput
  - пагинация Ozon через last_id
  - батчи stocks по 100 ID
  - группировка WB по supplierArticle (суммируются остатки по разным складам)
  - present-reserved для Ozon
  - пустые ответы
"""
from __future__ import annotations
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from app.sources import ozon, wildberries


# ============== OZON ==============

def _ozon_resp(json_data: dict, status: int = 200):
    """Mock httpx.Response."""
    resp = MagicMock()
    resp.status_code = status
    resp.json.return_value = json_data
    resp.raise_for_status = MagicMock()
    return resp


class TestOzon:
    def test_basic_single_page(self):
        """Одна страница товаров + один батч stocks."""
        list_response = {
            "result": {
                "items": [
                    {"product_id": 111, "offer_id": "SKU-A", "name": "Item A"},
                    {"product_id": 222, "offer_id": "SKU-B", "name": "Item B"},
                ],
                "last_id": "",
            }
        }
        stocks_response = {
            "items": [
                {"offer_id": "SKU-A", "name": "Item A",
                 "stocks": [{"present": 50, "reserved": 5}, {"present": 20, "reserved": 0}]},
                {"offer_id": "SKU-B", "name": "Item B",
                 "stocks": [{"present": 10, "reserved": 2}]},
            ]
        }

        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post.side_effect = [
            _ozon_resp(list_response),
            _ozon_resp(stocks_response),
        ]

        with patch.object(ozon.httpx, "Client", return_value=mock_client):
            snaps = ozon.fetch_snapshots("cid", "key")

        assert len(snaps) == 2
        by_sku = {s.sku: s for s in snaps}
        # present - reserved с двух складов: (50-5) + (20-0) = 65
        assert by_sku["SKU-A"].stock_quantity == 65
        assert by_sku["SKU-A"].product_name == "Item A"
        assert by_sku["SKU-B"].stock_quantity == 8

    def test_pagination(self):
        """Пагинация через last_id: 2 страницы товаров, потом stocks."""
        page1 = {"result": {"items": [{"product_id": 1, "offer_id": "A"}] * 1, "last_id": "cursor-2"}}
        page2 = {"result": {"items": [{"product_id": 2, "offer_id": "B"}], "last_id": ""}}
        stocks = {"items": [
            {"offer_id": "A", "stocks": [{"present": 5, "reserved": 0}]},
            {"offer_id": "B", "stocks": [{"present": 3, "reserved": 0}]},
        ]}

        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        # с page_size=1 первая страница вернёт ровно page_size элементов, идём дальше;
        # вторая получит 1 item (<page_size) → break
        mock_client.post.side_effect = [_ozon_resp(page1), _ozon_resp(page2), _ozon_resp(stocks)]

        with patch.object(ozon.httpx, "Client", return_value=mock_client):
            snaps = ozon.fetch_snapshots("cid", "key", page_size=1)

        assert len(snaps) == 2
        assert {s.sku for s in snaps} == {"A", "B"}

    def test_empty_catalog(self):
        """Пустой каталог → пустой список, никаких stocks-вызовов."""
        empty = {"result": {"items": [], "last_id": ""}}
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post.return_value = _ozon_resp(empty)

        with patch.object(ozon.httpx, "Client", return_value=mock_client):
            snaps = ozon.fetch_snapshots("cid", "key")

        assert snaps == []
        # вызвали только v3/product/list, не stocks
        assert mock_client.post.call_count == 1

    def test_negative_qty_clamped_to_zero(self):
        """Если reserved > present — qty=0, не отрицательное число."""
        list_resp = {"result": {"items": [{"product_id": 1, "offer_id": "NEG"}], "last_id": ""}}
        stocks_resp = {"items": [{"offer_id": "NEG", "stocks": [{"present": 2, "reserved": 10}]}]}

        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post.side_effect = [_ozon_resp(list_resp), _ozon_resp(stocks_resp)]

        with patch.object(ozon.httpx, "Client", return_value=mock_client):
            snaps = ozon.fetch_snapshots("cid", "key")

        assert snaps[0].stock_quantity == 0

    def test_missing_offer_id_uses_product_id(self):
        """Без offer_id — фоллбэк на product_id."""
        list_resp = {"result": {"items": [{"product_id": 999}], "last_id": ""}}
        stocks_resp = {"items": [{"product_id": 999, "stocks": [{"present": 5, "reserved": 0}]}]}

        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post.side_effect = [_ozon_resp(list_resp), _ozon_resp(stocks_resp)]

        with patch.object(ozon.httpx, "Client", return_value=mock_client):
            snaps = ozon.fetch_snapshots("cid", "key")

        assert snaps[0].sku == "999"
        assert snaps[0].stock_quantity == 5


# ============== WILDBERRIES ==============

class TestWildberries:
    def test_basic_single_warehouse(self):
        """Один товар на одном складе."""
        wb_response = [{
            "supplierArticle": "WB-001",
            "subject": "Кроссовки",
            "quantityFull": 25,
            "Price": 4500.0,
        }]
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_resp = MagicMock()
        mock_resp.json.return_value = wb_response
        mock_resp.raise_for_status = MagicMock()
        mock_client.get.return_value = mock_resp

        # Патчим with_retry чтобы не ждать ретраев
        with patch.object(wildberries.httpx, "Client", return_value=mock_client), \
             patch.object(wildberries, "with_retry", side_effect=lambda fn, **kw: fn()):
            snaps = wildberries.fetch_snapshots("token")

        assert len(snaps) == 1
        assert snaps[0].sku == "WB-001"
        assert snaps[0].stock_quantity == 25
        assert snaps[0].price == Decimal("4500.0")
        assert snaps[0].product_name == "Кроссовки"

    def test_groups_multi_warehouse_stocks(self):
        """Один SKU на нескольких складах — суммируются остатки."""
        wb_response = [
            {"supplierArticle": "SHARED", "subject": "Шапка", "quantityFull": 10, "Price": 1000},
            {"supplierArticle": "SHARED", "subject": "Шапка", "quantityFull": 15, "Price": 1000},
            {"supplierArticle": "SHARED", "subject": "Шапка", "quantityFull": 5,  "Price": 1000},
        ]
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_resp = MagicMock()
        mock_resp.json.return_value = wb_response
        mock_client.get.return_value = mock_resp

        with patch.object(wildberries.httpx, "Client", return_value=mock_client), \
             patch.object(wildberries, "with_retry", side_effect=lambda fn, **kw: fn()):
            snaps = wildberries.fetch_snapshots("token")

        assert len(snaps) == 1
        assert snaps[0].sku == "SHARED"
        assert snaps[0].stock_quantity == 30  # 10 + 15 + 5

    def test_skips_empty_sku(self):
        """Строки без supplierArticle — игнорируются."""
        wb_response = [
            {"supplierArticle": "", "quantityFull": 100, "Price": 0},
            {"supplierArticle": "VALID", "quantityFull": 5, "Price": 100},
        ]
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_resp = MagicMock()
        mock_resp.json.return_value = wb_response
        mock_client.get.return_value = mock_resp

        with patch.object(wildberries.httpx, "Client", return_value=mock_client), \
             patch.object(wildberries, "with_retry", side_effect=lambda fn, **kw: fn()):
            snaps = wildberries.fetch_snapshots("token")

        assert len(snaps) == 1
        assert snaps[0].sku == "VALID"

    def test_empty_response(self):
        """Пустой ответ WB → пустой список."""
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_resp = MagicMock()
        mock_resp.json.return_value = []
        mock_client.get.return_value = mock_resp

        with patch.object(wildberries.httpx, "Client", return_value=mock_client), \
             patch.object(wildberries, "with_retry", side_effect=lambda fn, **kw: fn()):
            snaps = wildberries.fetch_snapshots("token")

        assert snaps == []

    def test_uses_first_nonzero_price(self):
        """Цена берётся первая ненулевая (разные склады могут вернуть разные цены)."""
        wb_response = [
            {"supplierArticle": "X", "quantityFull": 5, "Price": 0},      # первая нулевая
            {"supplierArticle": "X", "quantityFull": 3, "Price": 1500},   # эту возьмём
            {"supplierArticle": "X", "quantityFull": 2, "Price": 2000},   # игнор
        ]
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_resp = MagicMock()
        mock_resp.json.return_value = wb_response
        mock_client.get.return_value = mock_resp

        with patch.object(wildberries.httpx, "Client", return_value=mock_client), \
             patch.object(wildberries, "with_retry", side_effect=lambda fn, **kw: fn()):
            snaps = wildberries.fetch_snapshots("token")

        assert len(snaps) == 1
        assert snaps[0].stock_quantity == 10
        assert snaps[0].price == Decimal("1500")
