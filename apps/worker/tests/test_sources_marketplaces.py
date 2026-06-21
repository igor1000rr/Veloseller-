"""Mock-тесты парсеров marketplace API на реальных форматах ответов.

Ozon: docs.ozon.ru/api/seller/
  - /v3/product/list — список product_id
  - /v4/product/info/stocks — остатки (filter+cursor body)
  - /v5/product/info/prices — цены (filter+cursor body)
  - /v3/product/info/list — реальные названия товаров по offer_id[] (БАГ 104)

Wildberries:
  - statistics-api: /api/v1/supplier/stocks — остатки/цены/категория
  - content-api: /content/v2/get/cards/list — реальные названия карточек (БАГ 104)
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


def _mock_client(responses: list):
    """Mock httpx.Client с заданной последовательностью ответов на post()."""
    cli = MagicMock()
    cli.__enter__ = MagicMock(return_value=cli)
    cli.__exit__ = MagicMock(return_value=False)
    cli.post.side_effect = responses
    return cli


# Часто используемый пустой ответ /v3/product/info/list (БАГ 104) для тестов
# которые не проверяют названия. Если SKU не возвращены — fallback на SKU.
_EMPTY_NAMES = {"items": []}


class TestOzon:
    def test_basic_single_page(self):
        """Один список → один батч stocks → один батч prices → /info/list → snapshots."""
        list_resp = {
            "result": {
                "items": [
                    {"product_id": 111, "offer_id": "SKU-A"},
                    {"product_id": 222, "offer_id": "SKU-B"},
                ],
                "last_id": "",
            }
        }
        stocks_resp = {
            "items": [
                {"product_id": 111, "offer_id": "SKU-A",
                 "stocks": [{"present": 50, "reserved": 5}, {"present": 20, "reserved": 0}]},
                {"product_id": 222, "offer_id": "SKU-B",
                 "stocks": [{"present": 10, "reserved": 2}]},
            ],
            "cursor": "",
        }
        prices_resp = {
            "items": [
                {"product_id": 111, "price": {"price": "1500.00", "marketing_price": "1490.00"}},
                {"product_id": 222, "price": {"price": "300.50"}},
            ],
            "cursor": "",
        }
        names_resp = {
            "items": [
                {"offer_id": "SKU-A", "name": "Item A real name"},
                {"offer_id": "SKU-B", "name": "Item B real name"},
            ]
        }

        cli = _mock_client([_ozon_resp(list_resp), _ozon_resp(stocks_resp), _ozon_resp(prices_resp), _ozon_resp(names_resp)])
        with patch.object(ozon.httpx, "Client", return_value=cli):
            snaps = ozon.fetch_snapshots("cid", "key")

        assert len(snaps) == 2
        by_sku = {s.sku: s for s in snaps}
        assert by_sku["SKU-A"].stock_quantity == 65
        assert by_sku["SKU-A"].product_name == "Item A real name"
        assert by_sku["SKU-A"].price == Decimal("1490.00")
        assert by_sku["SKU-B"].stock_quantity == 8
        assert by_sku["SKU-B"].product_name == "Item B real name"
        assert by_sku["SKU-B"].price == Decimal("300.50")

    def test_stocks_body_format_is_correct(self):
        """REGRESSION: /v4/product/info/stocks ожидает filter+cursor+limit body."""
        list_resp = {"result": {"items": [{"product_id": 1, "offer_id": "X"}], "last_id": ""}}
        stocks_resp = {"items": [{"product_id": 1, "offer_id": "X", "stocks": [{"present": 5, "reserved": 0}]}], "cursor": ""}
        prices_resp = {"items": [], "cursor": ""}

        cli = _mock_client([_ozon_resp(list_resp), _ozon_resp(stocks_resp), _ozon_resp(prices_resp), _ozon_resp(_EMPTY_NAMES)])
        with patch.object(ozon.httpx, "Client", return_value=cli):
            ozon.fetch_snapshots("cid", "key")

        stocks_call = cli.post.call_args_list[1]
        url = stocks_call[0][0]
        body = stocks_call[1]["json"]
        assert "/v4/product/info/stocks" in url
        assert "filter" in body, f"body должно содержать filter, получено: {body}"
        assert "product_id" in body["filter"]
        assert body["filter"]["product_id"] == ["1"]
        assert body["filter"]["visibility"] == "ALL"
        assert "cursor" in body
        assert "limit" in body

    def test_prices_body_format_is_correct(self):
        """REGRESSION: /v5/product/info/prices ожидает filter+cursor+limit body."""
        list_resp = {"result": {"items": [{"product_id": 1, "offer_id": "X"}], "last_id": ""}}
        stocks_resp = {"items": [{"product_id": 1, "offer_id": "X", "stocks": [{"present": 5, "reserved": 0}]}], "cursor": ""}
        prices_resp = {"items": [], "cursor": ""}

        cli = _mock_client([_ozon_resp(list_resp), _ozon_resp(stocks_resp), _ozon_resp(prices_resp), _ozon_resp(_EMPTY_NAMES)])
        with patch.object(ozon.httpx, "Client", return_value=cli):
            ozon.fetch_snapshots("cid", "key")

        prices_call = cli.post.call_args_list[2]
        url = prices_call[0][0]
        body = prices_call[1]["json"]
        assert "/v5/product/info/prices" in url
        assert "filter" in body
        assert body["filter"]["product_id"] == ["1"]

    def test_info_list_body_format_is_correct(self):
        """REGRESSION (БАГ 104): /v3/product/info/list ожидает {offer_id: [...]}."""
        list_resp = {"result": {"items": [{"product_id": 1, "offer_id": "X"}], "last_id": ""}}
        stocks_resp = {"items": [{"product_id": 1, "offer_id": "X", "stocks": [{"present": 5, "reserved": 0}]}], "cursor": ""}
        prices_resp = {"items": [], "cursor": ""}
        names_resp = {"items": [{"offer_id": "X", "name": "Real product name"}]}

        cli = _mock_client([_ozon_resp(list_resp), _ozon_resp(stocks_resp), _ozon_resp(prices_resp), _ozon_resp(names_resp)])
        with patch.object(ozon.httpx, "Client", return_value=cli):
            snaps = ozon.fetch_snapshots("cid", "key")

        info_call = cli.post.call_args_list[3]
        url = info_call[0][0]
        body = info_call[1]["json"]
        assert "/v3/product/info/list" in url
        assert body == {"offer_id": ["X"]}
        assert snaps[0].product_name == "Real product name"

    def test_info_list_failure_falls_back_to_none(self):
        """Если /v3/product/info/list упал — product_name=None, остальное работает."""
        import httpx as _httpx
        list_resp = {"result": {"items": [{"product_id": 1, "offer_id": "X"}], "last_id": ""}}
        stocks_resp = {"items": [{"product_id": 1, "offer_id": "X", "stocks": [{"present": 5, "reserved": 0}]}], "cursor": ""}
        prices_resp = {"items": [], "cursor": ""}
        names_error = _ozon_resp({}, status=500)
        names_error.raise_for_status.side_effect = _httpx.HTTPStatusError(
            "500", request=MagicMock(), response=MagicMock(status_code=500),
        )

        cli = _mock_client([_ozon_resp(list_resp), _ozon_resp(stocks_resp), _ozon_resp(prices_resp), names_error])
        with patch.object(ozon.httpx, "Client", return_value=cli), \
             patch.object(ozon, "with_retry", side_effect=lambda fn, **kw: fn()):
            snaps = ozon.fetch_snapshots("cid", "key")

        assert len(snaps) == 1
        assert snaps[0].sku == "X"
        assert snaps[0].stock_quantity == 5
        assert snaps[0].product_name is None  # _ensure_products сделает fallback на SKU

    def test_pagination_list(self):
        """Пагинация /v3/product/list через last_id: 2 страницы товаров."""
        page1 = {"result": {"items": [{"product_id": 1, "offer_id": "A"}], "last_id": "cursor-2"}}
        page2 = {"result": {"items": [{"product_id": 2, "offer_id": "B"}], "last_id": ""}}
        stocks = {"items": [
            {"product_id": 1, "offer_id": "A", "stocks": [{"present": 5, "reserved": 0}]},
            {"product_id": 2, "offer_id": "B", "stocks": [{"present": 3, "reserved": 0}]},
        ], "cursor": ""}
        prices = {"items": [], "cursor": ""}

        cli = _mock_client([_ozon_resp(page1), _ozon_resp(page2), _ozon_resp(stocks), _ozon_resp(prices), _ozon_resp(_EMPTY_NAMES)])
        with patch.object(ozon.httpx, "Client", return_value=cli):
            snaps = ozon.fetch_snapshots("cid", "key", page_size=1)

        assert len(snaps) == 2
        assert {s.sku for s in snaps} == {"A", "B"}

    def test_stocks_pagination_via_cursor(self):
        """Пагинация stocks через cursor (если Ozon возвращает не всё за раз)."""
        list_resp = {"result": {"items": [
            {"product_id": 1, "offer_id": "A"},
            {"product_id": 2, "offer_id": "B"},
        ], "last_id": ""}}
        stocks_page1 = {"items": [
            {"product_id": 1, "offer_id": "A", "stocks": [{"present": 5, "reserved": 0}]},
        ], "cursor": "next-page"}
        stocks_page2 = {"items": [
            {"product_id": 2, "offer_id": "B", "stocks": [{"present": 3, "reserved": 0}]},
        ], "cursor": ""}
        prices = {"items": [], "cursor": ""}

        cli = _mock_client([_ozon_resp(list_resp), _ozon_resp(stocks_page1), _ozon_resp(stocks_page2), _ozon_resp(prices), _ozon_resp(_EMPTY_NAMES)])
        with patch.object(ozon.httpx, "Client", return_value=cli):
            snaps = ozon.fetch_snapshots("cid", "key")

        assert len(snaps) == 2
        assert {s.sku for s in snaps} == {"A", "B"}

    def test_empty_catalog(self):
        """Пустой каталог → пустой список, никаких stocks/prices-вызовов."""
        empty = {"result": {"items": [], "last_id": ""}}
        cli = _mock_client([_ozon_resp(empty)])
        with patch.object(ozon.httpx, "Client", return_value=cli):
            snaps = ozon.fetch_snapshots("cid", "key")

        assert snaps == []
        assert cli.post.call_count == 1

    def test_negative_qty_clamped_to_zero(self):
        """Если reserved > present — qty=0, не отрицательное число."""
        list_resp = {"result": {"items": [{"product_id": 1, "offer_id": "NEG"}], "last_id": ""}}
        stocks_resp = {"items": [{"product_id": 1, "offer_id": "NEG",
                                   "stocks": [{"present": 2, "reserved": 10}]}], "cursor": ""}
        prices_resp = {"items": [], "cursor": ""}

        cli = _mock_client([_ozon_resp(list_resp), _ozon_resp(stocks_resp), _ozon_resp(prices_resp), _ozon_resp(_EMPTY_NAMES)])
        with patch.object(ozon.httpx, "Client", return_value=cli):
            snaps = ozon.fetch_snapshots("cid", "key")

        assert snaps[0].stock_quantity == 0

    def test_missing_offer_id_uses_product_id(self):
        """Без offer_id — фоллбэк на product_id как SKU."""
        list_resp = {"result": {"items": [{"product_id": 999}], "last_id": ""}}
        stocks_resp = {"items": [{"product_id": 999,
                                   "stocks": [{"present": 5, "reserved": 0}]}], "cursor": ""}
        prices_resp = {"items": [], "cursor": ""}

        cli = _mock_client([_ozon_resp(list_resp), _ozon_resp(stocks_resp), _ozon_resp(prices_resp), _ozon_resp(_EMPTY_NAMES)])
        with patch.object(ozon.httpx, "Client", return_value=cli):
            snaps = ozon.fetch_snapshots("cid", "key")

        assert snaps[0].sku == "999"
        assert snaps[0].stock_quantity == 5

    def test_price_unknown_when_prices_endpoint_fails(self):
        """Если /v5/product/info/prices упал — цена = None (carry-forward в
        _persist_snapshots), фантомный 0 не пишется. Остальное работает."""
        import httpx as _httpx
        list_resp = {"result": {"items": [{"product_id": 1, "offer_id": "X"}], "last_id": ""}}
        stocks_resp = {"items": [{"product_id": 1, "offer_id": "X",
                                   "stocks": [{"present": 5, "reserved": 0}]}], "cursor": ""}
        # prices endpoint выбрасывает HTTPStatusError
        prices_error = _ozon_resp({}, status=500)
        prices_error.raise_for_status.side_effect = _httpx.HTTPStatusError(
            "500", request=MagicMock(), response=MagicMock(status_code=500),
        )

        cli = _mock_client([_ozon_resp(list_resp), _ozon_resp(stocks_resp), prices_error, _ozon_resp(_EMPTY_NAMES)])
        # Отключаем retry чтобы prices_error выкинулся сразу (не 4 раза подряд)
        with patch.object(ozon.httpx, "Client", return_value=cli), \
             patch.object(ozon, "with_retry", side_effect=lambda fn, **kw: fn()):
            snaps = ozon.fetch_snapshots("cid", "key")

        assert len(snaps) == 1
        assert snaps[0].sku == "X"
        assert snaps[0].stock_quantity == 5
        assert snaps[0].price is None


# ============== WILDBERRIES ==============

class TestWildberries:
    def _mk_client(self, stocks_response: list, cards_response: dict | None = None):
        """Mock httpx.Client с двумя endpoint'ами: GET stocks + POST cards.

        cards_response=None → не настраиваем POST (тест ожидает что Content API
        вернёт ошибку или пустой результат, и fallback пойдёт на subject).
        """
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)

        stocks_mock = MagicMock()
        stocks_mock.json.return_value = stocks_response
        stocks_mock.raise_for_status = MagicMock()
        mock_client.get.return_value = stocks_mock

        if cards_response is None:
            # Content API возвращает пустой ответ → fallback на subject
            cards_response = {"cards": [], "cursor": {"total": 0}}
        cards_mock = MagicMock()
        cards_mock.json.return_value = cards_response
        cards_mock.raise_for_status = MagicMock()
        mock_client.post.return_value = cards_mock

        return mock_client

    def test_basic_single_warehouse(self):
        """Один товар на одном складе, Content API возвращает реальное название."""
        wb_response = [{
            "supplierArticle": "WB-001",
            "subject": "Кроссовки",
            "quantityFull": 25,
            "Price": 4500.0,
        }]
        cards_response = {
            "cards": [{"vendorCode": "WB-001", "title": "Кроссовки беговые Pro X"}],
            "cursor": {"total": 1},
        }
        mock_client = self._mk_client(wb_response, cards_response)

        with patch.object(wildberries.httpx, "Client", return_value=mock_client), \
             patch.object(wildberries, "with_retry", side_effect=lambda fn, **kw: fn()):
            snaps = wildberries.fetch_snapshots("token")

        assert len(snaps) == 1
        assert snaps[0].sku == "WB-001"
        assert snaps[0].stock_quantity == 25
        assert snaps[0].price == Decimal("4500.0")
        # Реальное название из Content API имеет приоритет над subject
        assert snaps[0].product_name == "Кроссовки беговые Pro X"

    def test_fallback_to_subject_when_content_api_empty(self):
        """Если Content API не дал карточку — fallback на subject (категория)."""
        wb_response = [{
            "supplierArticle": "WB-002",
            "subject": "Кроссовки",
            "quantityFull": 10,
            "Price": 3000,
        }]
        # Content API возвращает пустой список карточек
        mock_client = self._mk_client(wb_response, cards_response=None)

        with patch.object(wildberries.httpx, "Client", return_value=mock_client), \
             patch.object(wildberries, "with_retry", side_effect=lambda fn, **kw: fn()):
            snaps = wildberries.fetch_snapshots("token")

        assert len(snaps) == 1
        assert snaps[0].sku == "WB-002"
        assert snaps[0].product_name == "Кроссовки"  # fallback на subject

    def test_groups_multi_warehouse_stocks(self):
        """Один SKU на нескольких складах — суммируются остатки."""
        wb_response = [
            {"supplierArticle": "SHARED", "subject": "Шапка", "quantityFull": 10, "Price": 1000},
            {"supplierArticle": "SHARED", "subject": "Шапка", "quantityFull": 15, "Price": 1000},
            {"supplierArticle": "SHARED", "subject": "Шапка", "quantityFull": 5,  "Price": 1000},
        ]
        mock_client = self._mk_client(wb_response, cards_response=None)

        with patch.object(wildberries.httpx, "Client", return_value=mock_client), \
             patch.object(wildberries, "with_retry", side_effect=lambda fn, **kw: fn()):
            snaps = wildberries.fetch_snapshots("token")

        assert len(snaps) == 1
        assert snaps[0].sku == "SHARED"
        assert snaps[0].stock_quantity == 30

    def test_skips_empty_sku(self):
        """Строки без supplierArticle — игнорируются."""
        wb_response = [
            {"supplierArticle": "", "quantityFull": 100, "Price": 0},
            {"supplierArticle": "VALID", "quantityFull": 5, "Price": 100},
        ]
        mock_client = self._mk_client(wb_response, cards_response=None)

        with patch.object(wildberries.httpx, "Client", return_value=mock_client), \
             patch.object(wildberries, "with_retry", side_effect=lambda fn, **kw: fn()):
            snaps = wildberries.fetch_snapshots("token")

        assert len(snaps) == 1
        assert snaps[0].sku == "VALID"

    def test_empty_response(self):
        """Пустой ответ WB → пустой список."""
        mock_client = self._mk_client([], cards_response=None)

        with patch.object(wildberries.httpx, "Client", return_value=mock_client), \
             patch.object(wildberries, "with_retry", side_effect=lambda fn, **kw: fn()):
            snaps = wildberries.fetch_snapshots("token")

        assert snaps == []

    def test_uses_first_nonzero_price(self):
        """Цена берётся первая ненулевая."""
        wb_response = [
            {"supplierArticle": "X", "quantityFull": 5, "Price": 0},
            {"supplierArticle": "X", "quantityFull": 3, "Price": 1500},
            {"supplierArticle": "X", "quantityFull": 2, "Price": 2000},
        ]
        mock_client = self._mk_client(wb_response, cards_response=None)

        with patch.object(wildberries.httpx, "Client", return_value=mock_client), \
             patch.object(wildberries, "with_retry", side_effect=lambda fn, **kw: fn()):
            snaps = wildberries.fetch_snapshots("token")

        assert len(snaps) == 1
        assert snaps[0].stock_quantity == 10
        assert snaps[0].price == Decimal("1500")
