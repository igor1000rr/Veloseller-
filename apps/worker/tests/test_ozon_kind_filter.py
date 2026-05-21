"""Тесты на фильтрацию остатков Ozon по kind=fbo|fbs (multi-warehouse, май 2026).

После решения Александра один Ozon API-ключ может питать два склада:
- ozon_fbo — берём только остатки type='fbo' (склады маркетплейса)
- ozon_fbs — берём только остатки type='fbs' (склад продавца)
- None — суммируем всё (legacy/backward compat)

Покрытие:
- _stock_qty фильтрует stocks по type
- ALLOWED_KINDS защищает от опечаток
- fetch_snapshots с kind пропускает фильтр до stocks
"""
from __future__ import annotations
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from app.sources import ozon


def _ozon_resp(json_data: dict, status: int = 200):
    """Mock httpx.Response."""
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


_EMPTY_NAMES = {"items": []}


class TestStockQtyFilter:
    """Unit-тесты для _stock_qty(stocks, kind)."""

    def test_no_filter_sums_all(self):
        """kind=None — сумма всех типов (backward compat)."""
        stocks = [
            {"type": "fbo", "present": 10, "reserved": 2},
            {"type": "fbs", "present": 5,  "reserved": 0},
        ]
        assert ozon._stock_qty(stocks, None) == 13

    def test_fbo_filter_only_fbo(self):
        stocks = [
            {"type": "fbo", "present": 10, "reserved": 2},
            {"type": "fbs", "present": 5,  "reserved": 0},
        ]
        assert ozon._stock_qty(stocks, "fbo") == 8

    def test_fbs_filter_only_fbs(self):
        stocks = [
            {"type": "fbo", "present": 10, "reserved": 2},
            {"type": "fbs", "present": 5,  "reserved": 0},
        ]
        assert ozon._stock_qty(stocks, "fbs") == 5

    def test_fbo_filter_clamps_negative_to_zero(self):
        """reserved > present для fbo → 0, не отрицательное."""
        stocks = [
            {"type": "fbo", "present": 2, "reserved": 10},
            {"type": "fbs", "present": 5, "reserved": 0},
        ]
        assert ozon._stock_qty(stocks, "fbo") == 0

    def test_kind_case_insensitive(self):
        """В реальном Ozon API type=FBO/FBS бывает в разных регистрах — нормализуем."""
        stocks = [
            {"type": "FBO", "present": 10, "reserved": 0},
            {"type": "Fbs", "present": 5,  "reserved": 0},
        ]
        assert ozon._stock_qty(stocks, "fbo") == 10
        assert ozon._stock_qty(stocks, "fbs") == 5

    def test_no_type_field_skipped_when_filtering(self):
        """Если у stock-записи нет поля type — она не попадает в kind-фильтр."""
        stocks = [
            {"present": 100, "reserved": 0},  # без type
            {"type": "fbo", "present": 10, "reserved": 0},
        ]
        assert ozon._stock_qty(stocks, "fbo") == 10

    def test_no_type_field_summed_when_no_filter(self):
        """Когда kind=None — суммируем всё, включая записи без type."""
        stocks = [
            {"present": 100, "reserved": 0},
            {"type": "fbo", "present": 10, "reserved": 0},
        ]
        assert ozon._stock_qty(stocks, None) == 110

    def test_empty_stocks_returns_zero(self):
        assert ozon._stock_qty([], "fbo") == 0
        assert ozon._stock_qty([], "fbs") == 0
        assert ozon._stock_qty([], None) == 0


class TestFetchSnapshotsKind:
    """Интеграционные тесты — fetch_snapshots с kind применяет фильтр в _stock_qty."""

    def _build_full_response(self, stocks_for_sku):
        """Стандартный пайплайн ozon: list → stocks → prices → names."""
        list_resp = {"result": {"items": [{"product_id": 1, "offer_id": "NIKE-PEG-41"}], "last_id": ""}}
        stocks_resp = {
            "items": [{"product_id": 1, "offer_id": "NIKE-PEG-41", "stocks": stocks_for_sku}],
            "cursor": "",
        }
        prices_resp = {"items": [{"product_id": 1, "price": {"price": "5000"}}], "cursor": ""}
        names_resp = {"items": [{"offer_id": "NIKE-PEG-41", "name": "Nike Pegasus 41"}]}
        return [_ozon_resp(list_resp), _ozon_resp(stocks_resp), _ozon_resp(prices_resp), _ozon_resp(names_resp)]

    def test_kind_fbo_takes_only_fbo_stock(self):
        responses = self._build_full_response([
            {"type": "fbo", "present": 50, "reserved": 5},
            {"type": "fbs", "present": 20, "reserved": 0},
        ])
        cli = _mock_client(responses)
        with patch.object(ozon.httpx, "Client", return_value=cli):
            snaps = ozon.fetch_snapshots("cid", "key", kind="fbo")

        assert len(snaps) == 1
        assert snaps[0].sku == "NIKE-PEG-41"
        assert snaps[0].stock_quantity == 45  # 50-5, без FBS

    def test_kind_fbs_takes_only_fbs_stock(self):
        responses = self._build_full_response([
            {"type": "fbo", "present": 50, "reserved": 5},
            {"type": "fbs", "present": 20, "reserved": 0},
        ])
        cli = _mock_client(responses)
        with patch.object(ozon.httpx, "Client", return_value=cli):
            snaps = ozon.fetch_snapshots("cid", "key", kind="fbs")

        assert len(snaps) == 1
        assert snaps[0].stock_quantity == 20  # только FBS

    def test_kind_none_sums_all_legacy(self):
        """Backward compat — kind=None (или не передан) суммирует всё."""
        responses = self._build_full_response([
            {"type": "fbo", "present": 50, "reserved": 5},
            {"type": "fbs", "present": 20, "reserved": 0},
        ])
        cli = _mock_client(responses)
        with patch.object(ozon.httpx, "Client", return_value=cli):
            snaps = ozon.fetch_snapshots("cid", "key")  # без kind

        assert snaps[0].stock_quantity == 65  # 45 + 20

    def test_invalid_kind_raises(self):
        with pytest.raises(ValueError, match="kind"):
            ozon.fetch_snapshots("cid", "key", kind="invalid")

    def test_kind_with_only_fbo_present(self):
        """Если в stocks есть только FBO — fbs-склад получает 0 остатков (корректно)."""
        responses = self._build_full_response([
            {"type": "fbo", "present": 100, "reserved": 10},
        ])
        cli = _mock_client(responses)
        with patch.object(ozon.httpx, "Client", return_value=cli):
            snaps = ozon.fetch_snapshots("cid", "key", kind="fbs")

        # Для fbs-склада: товар на FBO не считается = 0
        assert snaps[0].stock_quantity == 0
