"""Ozon Seller API. Docs: https://docs.ozon.ru/api/seller/

Получаем 4 сущности:
  1. /v3/product/list — все product_id (без stocks/цен)
  2. /v4/product/info/stocks — остатки (filter+cursor пагинация)
  3. /v5/product/info/prices — цены (тоже filter+cursor)
  4. /v3/product/info/list — реальные названия товаров (name) по offer_id[]

БАГ 18 fix: добавили MAX_PAGES защиту от бесконечной пагинации (если Ozon API
возвращает повторяющийся cursor с непустым items).

БАГ 20 fix: для prices ловим более широкий Exception — раньше httpx.HTTPStatusError
не покрывал timeout/network errors, sync падал на проблемах с prices API.

БАГ 104 fix: /v4/product/info/stocks НЕ возвращает поле name — раньше в БД писался
SKU вместо названия. Теперь делаем отдельный запрос /v3/product/info/list по offer_id[]
для получения реальных названий товаров.

Multi-warehouse (май 2026): один и тот же Ozon API-ключ может питать два склада:
  • ozon_fbo — анализ остатков на складах Ozon (FBO)
  • ozon_fbs — анализ собственного склада через остатки FBS
Параметр `kind` определяет фильтрацию items[].stocks[type]. Значение None оставлено
для совместимости (сумма всех типов).
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Optional
import httpx
from app.schemas import SnapshotInput
from app.sources._http import with_retry

logger = logging.getLogger("veloseller.ozon")

BASE = "https://api-seller.ozon.ru"

# Защита от бесконечной пагинации. При 1000 items/page это >2M SKU — заведомо больше
# чем когда-либо у одного селлера. Если такое случится — что-то не так с API.
MAX_PAGES_PER_BATCH = 50

# Размер батча для /v3/product/info/list — endpoint ограничен 1000 offer_id за запрос
INFO_LIST_BATCH = 1000

# Допустимые значения kind: 'fbo' (остатки на складах Ozon), 'fbs' (склад продавца),
# None — суммировать всё (legacy / обратная совместимость).
ALLOWED_KINDS = {"fbo", "fbs", None}


def _headers(client_id: str, api_key: str) -> dict[str, str]:
    return {"Client-Id": client_id, "Api-Key": api_key, "Content-Type": "application/json"}


def _decimal(v) -> Decimal:
    """Безопасное преобразование значения в Decimal с fallback на 0."""
    if v is None or v == "":
        return Decimal("0")
    try:
        return Decimal(str(v))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal("0")


def _fetch_product_names(cli: httpx.Client, client_id: str, api_key: str, offer_ids: list[str]) -> dict[str, str]:
    """Получить реальные названия товаров по offer_id через /v3/product/info/list.

    Returns:
        dict {offer_id: name}. Если для какого-то offer_id endpoint не вернул name,
        ключа в результате просто не будет — вызывающий код должен сделать fallback.
    """
    names_by_offer: dict[str, str] = {}
    for i in range(0, len(offer_ids), INFO_LIST_BATCH):
        batch = offer_ids[i : i + INFO_LIST_BATCH]

        def _info_call(b=batch):
            resp = cli.post(
                f"{BASE}/v3/product/info/list",
                headers=_headers(client_id, api_key),
                json={"offer_id": b},
            )
            resp.raise_for_status()
            return resp.json()

        try:
            data = with_retry(_info_call)
        except Exception as e:
            logger.warning("ozon /v3/product/info/list failed for batch %d: %s", i, e)
            continue

        items = (data.get("items") or [])
        for item in items:
            offer_id = str(item.get("offer_id") or "")
            name = item.get("name")
            if offer_id and name and isinstance(name, str) and name.strip():
                names_by_offer[offer_id] = name.strip()

    logger.info("ozon names fetched: %d / %d offer_ids", len(names_by_offer), len(offer_ids))
    return names_by_offer


def _stock_qty(stocks: list[dict], kind: Optional[str]) -> int:
    """Посчитать доступный остаток с учётом фильтра kind.

    Ozon /v4/product/info/stocks возвращает stocks как массив объектов с полем 'type':
    [{type: 'fbo', present: 12, reserved: 2}, {type: 'fbs', present: 5, reserved: 0}]

    Args:
        stocks: массив stock-записей из ответа Ozon API
        kind: 'fbo' / 'fbs' / None (= все типы, сумма для обратной совместимости)

    Returns:
        available = max(0, sum(present - reserved)) по отфильтрованным записям
    """
    total = 0
    for s in stocks:
        if kind is not None:
            stock_type = (s.get("type") or "").lower()
            if stock_type != kind:
                continue
        total += int(s.get("present", 0)) - int(s.get("reserved", 0))
    return max(0, total)


def fetch_snapshots(
    client_id: str,
    api_key: str,
    page_size: int = 1000,
    kind: Optional[str] = None,
) -> list[SnapshotInput]:
    """Получить snapshots всех SKU продавца с остатками, ценами и реальными названиями.

    Args:
        client_id, api_key: креды Ozon Seller API.
        page_size: размер страницы для /v3/product/list.
        kind: фильтр типа остатков — 'fbo', 'fbs' или None (сумма всех).
              По warehouse_kind в data_connections: ozon_fbo → 'fbo', ozon_fbs → 'fbs'.
    """
    if kind not in ALLOWED_KINDS:
        raise ValueError(f"Invalid kind={kind!r}, expected one of {ALLOWED_KINDS}")

    now = datetime.now(timezone.utc)

    with httpx.Client(timeout=60.0) as cli:
        # 1. Все product_id через пагинацию /v3/product/list
        product_ids: list[str] = []
        last_id = ""
        pages = 0
        while pages < MAX_PAGES_PER_BATCH:
            pages += 1

            def _list_call(lid=last_id):
                resp = cli.post(
                    f"{BASE}/v3/product/list",
                    headers=_headers(client_id, api_key),
                    json={"filter": {"visibility": "ALL"}, "last_id": lid, "limit": page_size},
                )
                resp.raise_for_status()
                return resp.json()

            data = with_retry(_list_call).get("result", {})
            items = data.get("items", [])
            if not items:
                break
            product_ids.extend(str(i["product_id"]) for i in items)
            new_last_id = data.get("last_id") or ""
            if not new_last_id or new_last_id == last_id or len(items) < page_size:
                break
            last_id = new_last_id

        if pages >= MAX_PAGES_PER_BATCH:
            logger.warning("ozon /v3/product/list hit MAX_PAGES_PER_BATCH=%d", MAX_PAGES_PER_BATCH)

        if not product_ids:
            return []

        # 2. Остатки через /v4/product/info/stocks (фильтрация по kind)
        stocks_by_pid: dict[str, dict] = {}

        for i in range(0, len(product_ids), 1000):
            batch = product_ids[i : i + 1000]
            cursor = ""
            pages = 0
            while pages < MAX_PAGES_PER_BATCH:
                pages += 1

                def _stocks_call(b=batch, c=cursor):
                    resp = cli.post(
                        f"{BASE}/v4/product/info/stocks",
                        headers=_headers(client_id, api_key),
                        json={
                            "filter": {"product_id": b, "visibility": "ALL"},
                            "cursor": c,
                            "limit": 1000,
                        },
                    )
                    resp.raise_for_status()
                    return resp.json()

                data = with_retry(_stocks_call)
                items = data.get("items", [])
                for item in items:
                    pid = str(item.get("product_id") or "")
                    if not pid:
                        continue
                    stocks = item.get("stocks", [])
                    qty = _stock_qty(stocks, kind)
                    stocks_by_pid[pid] = {
                        "offer_id": str(item.get("offer_id") or pid),
                        # name из /v4/product/info/stocks отсутствует — заполним из info/list ниже
                        "name": None,
                        "qty": qty,
                    }
                new_cursor = data.get("cursor") or ""
                if not new_cursor or new_cursor == cursor or not items:
                    break
                cursor = new_cursor

            if pages >= MAX_PAGES_PER_BATCH:
                logger.warning("ozon /v4/product/info/stocks hit MAX_PAGES_PER_BATCH=%d for batch %d", MAX_PAGES_PER_BATCH, i)

        # 3. Цены через /v5/product/info/prices
        prices_by_pid: dict[str, Decimal] = {}

        for i in range(0, len(product_ids), 1000):
            batch = product_ids[i : i + 1000]
            cursor = ""
            pages = 0
            while pages < MAX_PAGES_PER_BATCH:
                pages += 1

                def _prices_call(b=batch, c=cursor):
                    resp = cli.post(
                        f"{BASE}/v5/product/info/prices",
                        headers=_headers(client_id, api_key),
                        json={
                            "filter": {"product_id": b, "visibility": "ALL"},
                            "cursor": c,
                            "limit": 1000,
                        },
                    )
                    resp.raise_for_status()
                    return resp.json()

                try:
                    data = with_retry(_prices_call)
                except Exception as e:
                    logger.warning("ozon prices fetch failed for batch %d: %s", i, e)
                    data = {"items": [], "cursor": ""}
                items = data.get("items", [])
                for item in items:
                    pid = str(item.get("product_id") or "")
                    if not pid:
                        continue
                    price_info = item.get("price") or {}
                    raw = price_info.get("marketing_price") or price_info.get("price") or price_info.get("min_price") or "0"
                    prices_by_pid[pid] = _decimal(raw)
                new_cursor = data.get("cursor") or ""
                if not new_cursor or new_cursor == cursor or not items:
                    break
                cursor = new_cursor

        # 4. Реальные названия товаров через /v3/product/info/list (БАГ 104 fix)
        unique_offer_ids = sorted({s["offer_id"] for s in stocks_by_pid.values() if s.get("offer_id")})
        names_by_offer = _fetch_product_names(cli, client_id, api_key, unique_offer_ids)

        # 5. Собираем SnapshotInput
        out: list[SnapshotInput] = []
        for pid, s in stocks_by_pid.items():
            offer_id = s["offer_id"]
            real_name = names_by_offer.get(offer_id)
            out.append(SnapshotInput(
                sku=offer_id,
                product_name=real_name or None,
                stock_quantity=s["qty"],
                price=prices_by_pid.get(pid, Decimal("0")),
                snapshot_time=now,
            ))

        logger.info("ozon fetch done (kind=%s): product_ids=%d, stocks=%d, prices=%d, names=%d, snapshots=%d",
                    kind, len(product_ids), len(stocks_by_pid), len(prices_by_pid), len(names_by_offer), len(out))

    return out
