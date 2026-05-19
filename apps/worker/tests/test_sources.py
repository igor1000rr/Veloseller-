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

    # ========================================================================
    # БАГ 16: UTF-8 BOM не должен ломать required check
    # ========================================================================

    def test_utf8_bom_in_bytes(self):
        """Excel экспортирует CSV с UTF-8 BOM (\\xef\\xbb\\xbf) в начале."""
        bom = b"\xef\xbb\xbf"
        content = bom + b"sku,stock_quantity,price\nA1,10,100\n"
        snaps = parse_csv(content)
        assert len(snaps) == 1
        assert snaps[0].sku == "A1"

    def test_utf8_bom_in_string(self):
        """Если уже decoded, \\ufeff в начале строки убирается."""
        text = "\ufeffsku,stock_quantity,price\nA1,10,100\n"
        snaps = parse_csv(text)
        assert len(snaps) == 1
        assert snaps[0].sku == "A1"

    def test_negative_stock_skipped(self):
        """Отрицательный stock → строка пропускается с warning."""
        text = "sku,stock_quantity,price\nA1,-5,100\nB2,10,200\n"
        snaps = parse_csv(text)
        assert len(snaps) == 1
        assert snaps[0].sku == "B2"

    def test_comma_decimal_in_price(self):
        """Запятая как десятичный разделитель (русский формат)."""
        text = "sku,stock_quantity,price\nA1,10,99,50\n"
        # csv.DictReader интерпретирует 99,50 как 2 поля → "99" в price и "50" в лишнем
        # Это означает что для текущего реализации запятая в price НЕ работает.
        # Однако если price="100,50" в одном field (с quoting), replace должен сработать.
        text2 = 'sku,stock_quantity,price\nA1,10,"100,50"\n'
        snaps = parse_csv(text2)
        assert len(snaps) == 1
        assert float(snaps[0].price) == 100.50

    def test_duplicate_sku_last_wins(self):
        """Дубликат SKU — последняя запись побеждает."""
        text = "sku,stock_quantity,price\nA1,10,100\nA1,20,150\n"
        snaps = parse_csv(text)
        assert len(snaps) == 1
        assert snaps[0].stock_quantity == 20


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

    def test_retry_on_connect_timeout(self):
        """БАГ 22: ConnectTimeout раньше не покрывался — теперь должен."""
        calls = []
        def fn():
            calls.append(1)
            if len(calls) < 2:
                raise httpx.ConnectTimeout("timeout")
            return "ok"
        result = with_retry(fn, max_attempts=3, base_delay=0.01)
        assert result == "ok"
        assert len(calls) == 2

    def test_retry_on_pool_timeout(self):
        """БАГ 22: PoolTimeout тоже должен retry'иться (TransportError parent)."""
        calls = []
        def fn():
            calls.append(1)
            if len(calls) < 2:
                raise httpx.PoolTimeout("pool")
            return "ok"
        result = with_retry(fn, max_attempts=3, base_delay=0.01)
        assert result == "ok"
        assert len(calls) == 2
