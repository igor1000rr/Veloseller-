"""Тесты на фильтрацию остатков Ozon по kind=fbo|fbs (multi-warehouse, май 2026).

После решения Александра один Ozon API-ключ может питать два склада:
- ozon_fbo — остатки на складах маркетплейса (FBO)
- ozon_fbs — остатки type='fbs' из /v4 (склад продавца)
- None — суммируем всё из /v4 (legacy/backward compat)

Июнь 2026: Ozon перенёс FBO-остатки в /v1/analytics/stocks (/v4 возвращает только
FBS/rFBS/FBP) — kind='fbo' теперь идёт через отдельный пайплайн:
list → info/list (offer_id+name+sku) → analytics/stocks → prices.

Покрытие:
- _stock_qty фильтрует stocks по type (fbs/None-путь)
- ALLOWED_KINDS защищает от опечаток
- fetch_snapshots kind='fbs' фильтрует /v4-остатки
- fetch_snapshots kind='fbo' берёт остатки из /v1/analytics/stocks
"""
from __future__ import annotations
from decimal import Decimal
from unittest.mock import MagicMock, patch

import httpx
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


class TestRaiseIncludesBody:
    """_raise(resp) — сохраняет тип httpx.HTTPStatusError, но добавляет тело Ozon.

    Зачем: голый resp.raise_for_status() даёт лишь «Client error '400 Bad Request'»
    без причины. Ozon кладёт причину (битый Client-Id, не тот тип ключа, лимит) в
    body — её и надо донести до last_error, чтобы продавец понял, что чинить.
    """

    @staticmethod
    def _resp(status: int, body: str) -> httpx.Response:
        req = httpx.Request("POST", f"{ozon.BASE}/v3/product/list")
        return httpx.Response(status_code=status, request=req, text=body)

    def test_success_is_noop(self):
        # 2xx — ничего не поднимаем, синк продолжается.
        ozon._raise(self._resp(200, '{"result": {}}'))

    def test_400_raises_with_body(self):
        body = '{"code": 3, "message": "Client-Id or Api-Key not found"}'
        with pytest.raises(httpx.HTTPStatusError) as ei:
            ozon._raise(self._resp(400, body))
        msg = str(ei.value)
        # Причина Ozon видна в сообщении (попадёт в last_error).
        assert "Client-Id or Api-Key not found" in msg
        assert "400" in msg
        # Тип не изменился — логика ретраев/классификации не ломается.
        assert ei.value.response.status_code == 400

    def test_body_truncated(self):
        # Очень длинное тело обрезаем (last_error не должен распухать).
        with pytest.raises(httpx.HTTPStatusError) as ei:
            ozon._raise(self._resp(500, "x" * 5000))
        assert len(str(ei.value)) < 1000


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
    """Интеграционные тесты fetch_snapshots с kind.

    fbs/None — старый пайплайн: list → /v4 stocks → prices → names.
    fbo — новый (июнь 2026): list → info/list → /v1/analytics/stocks → prices.
    """

    def _build_full_response(self, stocks_for_sku):
        """Стандартный fbs/None-пайплайн: list → stocks → prices → names."""
        list_resp = {"result": {"items": [{"product_id": 1, "offer_id": "NIKE-PEG-41"}], "last_id": ""}}
        stocks_resp = {
            "items": [{"product_id": 1, "offer_id": "NIKE-PEG-41", "stocks": stocks_for_sku}],
            "cursor": "",
        }
        prices_resp = {"items": [{"product_id": 1, "price": {"price": "5000"}}], "cursor": ""}
        names_resp = {"items": [{"offer_id": "NIKE-PEG-41", "name": "Nike Pegasus 41"}]}
        return [_ozon_resp(list_resp), _ozon_resp(stocks_resp), _ozon_resp(prices_resp), _ozon_resp(names_resp)]

    def _build_fbo_response(self, analytics_items, info_items=None):
        """FBO-пайплайн: list → info/list → analytics → prices."""
        list_resp = {"result": {"items": [{"product_id": 1, "offer_id": "NIKE-PEG-41"}], "last_id": ""}}
        info_resp = {"items": info_items if info_items is not None else [
            {"id": 1, "offer_id": "NIKE-PEG-41", "name": "Nike Pegasus 41", "sku": 111222},
        ]}
        analytics_resp = {"items": analytics_items}
        prices_resp = {"items": [{"product_id": 1, "price": {"price": "5000"}}], "cursor": ""}
        return [_ozon_resp(list_resp), _ozon_resp(info_resp), _ozon_resp(analytics_resp), _ozon_resp(prices_resp)]

    def test_kind_fbo_uses_analytics_stocks(self):
        """kind='fbo' берёт остатки из /v1/analytics/stocks, не из /v4."""
        responses = self._build_fbo_response([
            {"sku": 111222, "available_stock_count": 45},
        ])
        cli = _mock_client(responses)
        with patch.object(ozon.httpx, "Client", return_value=cli):
            snaps = ozon.fetch_snapshots("cid", "key", kind="fbo")

        assert len(snaps) == 1
        assert snaps[0].sku == "NIKE-PEG-41"
        assert snaps[0].stock_quantity == 45
        assert snaps[0].product_name == "Nike Pegasus 41"
        assert snaps[0].price == Decimal("5000")

        # Проверяем маршрут: info/list по product_id, затем analytics по sku.
        info_call = cli.post.call_args_list[1]
        assert "/v3/product/info/list" in info_call[0][0]
        assert info_call[1]["json"] == {"product_id": ["1"]}

        analytics_call = cli.post.call_args_list[2]
        assert "/v1/analytics/stocks" in analytics_call[0][0]
        assert analytics_call[1]["json"] == {"skus": ["111222"]}

        # /v4/product/info/stocks в fbo-пути не вызывается
        urls = [c[0][0] for c in cli.post.call_args_list]
        assert not any("/v4/product/info/stocks" in u for u in urls)

    def test_kind_fbo_sums_cluster_rows(self):
        """Несколько analytics-записей одного sku (кластера) — суммируются."""
        responses = self._build_fbo_response([
            {"sku": 111222, "available_stock_count": 40},
            {"sku": 111222, "available_stock_count": 5},
        ])
        cli = _mock_client(responses)
        with patch.object(ozon.httpx, "Client", return_value=cli):
            snaps = ozon.fetch_snapshots("cid", "key", kind="fbo")

        assert snaps[0].stock_quantity == 45

    def test_kind_fbo_missing_in_analytics_is_zero(self):
        """Товар без записи в analytics — легитимный 0 (на складах Ozon его нет)."""
        responses = self._build_fbo_response([])
        cli = _mock_client(responses)
        with patch.object(ozon.httpx, "Client", return_value=cli):
            snaps = ozon.fetch_snapshots("cid", "key", kind="fbo")

        assert len(snaps) == 1
        assert snaps[0].stock_quantity == 0

    def test_kind_fbo_truncated_catalog_raises(self):
        """FBO: /v3/product/list упёрся в лимит страниц с НЕисчерпанным курсором →
        синк ПАДАЕТ, а не отдаёт частичный каталог (раньше FBO молча обрезал хвост
        по len(items)<page_size; теперь паритет с fbs/None-путём)."""
        # 50 страниц, каждая с непустыми items и ДВИГАЮЩИМСЯ last_id → курсор никогда
        # не исчерпывается → truncated остаётся True → RuntimeError.
        responses = [
            _ozon_resp({"result": {"items": [{"product_id": i}], "last_id": f"cur{i}"}})
            for i in range(ozon.MAX_PAGES_PER_BATCH)
        ]
        cli = _mock_client(responses)
        with patch.object(ozon.httpx, "Client", return_value=cli):
            with pytest.raises(RuntimeError, match="превышен лимит"):
                ozon._fetch_snapshots_fbo("cid", "key")

    def test_kind_fbo_short_last_page_not_truncated(self):
        """FBO: короткая последняя страница (last_id пуст) — это НОРМАЛЬНОЕ
        завершение, не усечение. Раньше len(items)<page_size мог оборвать раньше."""
        # Страница 1: полная (page_size=2), курсор двигается; страница 2: короткая
        # (1 item) НО курсор пуст → штатный конец, без raise.
        responses = [
            _ozon_resp({"result": {"items": [{"product_id": 1}, {"product_id": 2}], "last_id": "cur1"}}),
            _ozon_resp({"result": {"items": [{"product_id": 3}], "last_id": ""}}),
            # info/list + analytics + prices — пустые, нам важно лишь что не было raise
            _ozon_resp({"items": []}),
            _ozon_resp({"items": []}),
            _ozon_resp({"items": [], "cursor": ""}),
        ]
        cli = _mock_client(responses)
        with patch.object(ozon.httpx, "Client", return_value=cli):
            snaps = ozon._fetch_snapshots_fbo("cid", "key", page_size=2)
        # 3 product_id прошли пагинацию без падения (остатки 0 — нет в analytics)
        assert isinstance(snaps, list)

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
        """Backward compat — kind=None (или не передан) суммирует всё из /v4."""
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
        """Если в /v4-stocks есть только FBO — fbs-склад получает 0 остатков (корректно)."""
        responses = self._build_full_response([
            {"type": "fbo", "present": 100, "reserved": 10},
        ])
        cli = _mock_client(responses)
        with patch.object(ozon.httpx, "Client", return_value=cli):
            snaps = ozon.fetch_snapshots("cid", "key", kind="fbs")

        # Для fbs-склада: товар на FBO не считается = 0
        assert snaps[0].stock_quantity == 0

    def test_kind_fbo_sku_from_sources_fallback(self):
        """Если у товара нет верхнеуровневого sku — берём из sources[]."""
        responses = self._build_fbo_response(
            [{"sku": 999888, "available_stock_count": 7}],
            info_items=[{
                "id": 1, "offer_id": "NIKE-PEG-41", "name": "Nike Pegasus 41",
                "sources": [{"sku": 999888, "source": "fbo"}],
            }],
        )
        cli = _mock_client(responses)
        with patch.object(ozon.httpx, "Client", return_value=cli):
            snaps = ozon.fetch_snapshots("cid", "key", kind="fbo")

        assert snaps[0].stock_quantity == 7
