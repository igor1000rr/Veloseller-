"""Mock-тесты парсера Shopify Admin GraphQL (productVariants)."""
from __future__ import annotations
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from app.sources import shopify


def _resp(json_data: dict, status: int = 200):
    resp = MagicMock()
    resp.status_code = status
    resp.json.return_value = json_data
    resp.raise_for_status = MagicMock()
    return resp


def _mock_client(responses: list):
    cli = MagicMock()
    cli.__enter__ = MagicMock(return_value=cli)
    cli.__exit__ = MagicMock(return_value=False)
    cli.post.side_effect = responses
    return cli


def _page(nodes, has_next=False, cursor=""):
    return {"data": {"productVariants": {
        "pageInfo": {"hasNextPage": has_next, "endCursor": cursor},
        "nodes": nodes,
    }}}


class TestShopify:
    def test_basic(self):
        page = _page([
            {"sku": "A-1", "title": "Default Title", "price": "19.99",
             "inventoryQuantity": 12, "product": {"title": "T-Shirt"}},
            {"sku": "B-2", "title": "Red / L", "price": "5.00",
             "inventoryQuantity": 3, "product": {"title": "Cap"}},
        ])
        cli = _mock_client([_resp(page)])
        with patch.object(shopify.httpx, "Client", return_value=cli), \
             patch.object(shopify, "with_retry", side_effect=lambda fn, **kw: fn()):
            snaps = shopify.fetch_snapshots("mystore", "shpat_x")

        by = {s.sku: s for s in snaps}
        assert by["A-1"].stock_quantity == 12
        assert by["A-1"].price == Decimal("19.99")
        assert by["A-1"].product_name == "T-Shirt"   # Default Title опущен
        assert by["B-2"].product_name == "Cap / Red / L"

    def test_pagination(self):
        p1 = _page([{"sku": "A", "title": "", "price": "1", "inventoryQuantity": 1, "product": {"title": "P"}}], has_next=True, cursor="c1")
        p2 = _page([{"sku": "B", "title": "", "price": "2", "inventoryQuantity": 2, "product": {"title": "P"}}], has_next=False, cursor="")
        cli = _mock_client([_resp(p1), _resp(p2)])
        with patch.object(shopify.httpx, "Client", return_value=cli), \
             patch.object(shopify, "with_retry", side_effect=lambda fn, **kw: fn()), \
             patch.object(shopify.time, "sleep", lambda *_: None):
            snaps = shopify.fetch_snapshots("mystore.myshopify.com", "shpat_x")
        assert {s.sku for s in snaps} == {"A", "B"}

    def test_skips_empty_sku(self):
        page = _page([
            {"sku": "", "title": "", "price": "1", "inventoryQuantity": 99, "product": {"title": "P"}},
            {"sku": "OK", "title": "", "price": "1", "inventoryQuantity": 5, "product": {"title": "P"}},
        ])
        cli = _mock_client([_resp(page)])
        with patch.object(shopify.httpx, "Client", return_value=cli), \
             patch.object(shopify, "with_retry", side_effect=lambda fn, **kw: fn()):
            snaps = shopify.fetch_snapshots("s", "t")
        assert [s.sku for s in snaps] == ["OK"]

    def test_negative_and_null_qty_clamped(self):
        page = _page([
            {"sku": "NEG", "title": "", "price": "1", "inventoryQuantity": -7, "product": {"title": "P"}},
            {"sku": "NULL", "title": "", "price": "1", "inventoryQuantity": None, "product": {"title": "P"}},
        ])
        cli = _mock_client([_resp(page)])
        with patch.object(shopify.httpx, "Client", return_value=cli), \
             patch.object(shopify, "with_retry", side_effect=lambda fn, **kw: fn()):
            snaps = shopify.fetch_snapshots("s", "t")
        q = {s.sku: s.stock_quantity for s in snaps}
        assert q == {"NEG": 0, "NULL": 0}

    def test_duplicate_sku_first_wins(self):
        page = _page([
            {"sku": "DUP", "title": "", "price": "10", "inventoryQuantity": 4, "product": {"title": "P"}},
            {"sku": "DUP", "title": "", "price": "20", "inventoryQuantity": 9, "product": {"title": "P"}},
        ])
        cli = _mock_client([_resp(page)])
        with patch.object(shopify.httpx, "Client", return_value=cli), \
             patch.object(shopify, "with_retry", side_effect=lambda fn, **kw: fn()):
            snaps = shopify.fetch_snapshots("s", "t")
        assert len(snaps) == 1
        assert snaps[0].price == Decimal("10")

    def test_graphql_errors_raise(self):
        cli = _mock_client([_resp({"errors": [{"message": "Throttled"}]})])
        with patch.object(shopify.httpx, "Client", return_value=cli), \
             patch.object(shopify, "with_retry", side_effect=lambda fn, **kw: fn()):
            with pytest.raises(ValueError, match="Shopify GraphQL"):
                shopify.fetch_snapshots("s", "t")

    def test_invalid_token_raises_friendly(self):
        cli = _mock_client([_resp({}, status=401)])
        with patch.object(shopify.httpx, "Client", return_value=cli), \
             patch.object(shopify, "with_retry", side_effect=lambda fn, **kw: fn()):
            with pytest.raises(ValueError, match="access token"):
                shopify.fetch_snapshots("s", "t")

    def test_normalize_domain(self):
        assert shopify.normalize_shop_domain("mystore") == "mystore.myshopify.com"
        assert shopify.normalize_shop_domain("https://mystore.myshopify.com/") == "mystore.myshopify.com"
        assert shopify.normalize_shop_domain("MyStore.myshopify.com") == "mystore.myshopify.com"
