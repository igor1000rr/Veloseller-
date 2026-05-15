"""Тесты source-парсеров (CSV) и HTTP retry."""
from __future__ import annotations

import httpx
import pytest

from app.sources.csv_upload import parse_csv
from app.sources._http import with_retry


class TestParseCsv:
    def test_basic(self):
        text = "sku,product_name,stock_quantity,price\nA1,Item A,10,100.50\nB2,,5,200\n"
        snaps = parse_csv(text)
        assert len(snaps) == 2
        assert snaps[0].sku == "A1" and snaps[0].product_name == "Item A"
        assert snaps[0].stock_quantity == 10 and float(snaps[0].price) == 100.50
        assert snaps[1].sku == "B2" and snaps[1].product_name is None

    def test_required_columns(self):
        text = "sku,quantity\nA1,10\n"
        with pytest.raises(ValueError):
            parse_csv(text)

    def test_case_insensitive_headers(self):
        text = "SKU,Stock_Quantity,Price\nA1,10,100\n"
        snaps = parse_csv(text)
        assert len(snaps) == 1
        assert snaps[0].sku == "A1"

    def test_bytes_input(self):
        snaps = parse_csv(b"sku,stock_quantity,price\nA1,10,100\n")
        assert len(snaps) == 1


class TestRetry:
    def test_success_first_attempt(self):
        calls = []
        def fn():
            calls.append(1)
            return "ok"
        assert with_retry(fn) == "ok"
        assert len(calls) == 1

    def test_retry_on_500(self):
        calls = []
        def fn():
            calls.append(1)
            if len(calls) < 3:
                response = httpx.Response(500, request=httpx.Request("GET", "http://x"))
                raise httpx.HTTPStatusError("500", request=response.request, response=response)
            return "ok"
        result = with_retry(fn, max_attempts=4, base_delay=0.01)
        assert result == "ok"
        assert len(calls) == 3

    def test_no_retry_on_400(self):
        def fn():
            response = httpx.Response(400, request=httpx.Request("GET", "http://x"))
            raise httpx.HTTPStatusError("400", request=response.request, response=response)
        with pytest.raises(httpx.HTTPStatusError):
            with_retry(fn, max_attempts=3, base_delay=0.01)

    def test_exhausted(self):
        def fn():
            response = httpx.Response(503, request=httpx.Request("GET", "http://x"))
            raise httpx.HTTPStatusError("503", request=response.request, response=response)
        with pytest.raises(httpx.HTTPStatusError):
            with_retry(fn, max_attempts=2, base_delay=0.01)
