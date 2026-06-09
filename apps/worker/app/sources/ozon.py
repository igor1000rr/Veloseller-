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

FBO через analytics (июнь 2026, скрин Александра 02.06): Ozon перевёл FBO-остатки
в отдельный метод /v1/analytics/stocks — /v4/product/info/stocks теперь возвращает
только схемы FBS/rFBS/FBP. Из-за этого склады ozon_fbo и ozon_fbs показывали
одинаковые данные. Для kind='fbo' теперь отдельный пайплайн:
  /v3/product/list → /v3/product/info/list (offer_id+name+sku) →
  /v1/analytics/stocks (available_stock_count по sku, батчи по 100) → /v5 prices.
Путь fbs/None не изменён.
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

# /v1/analytics/stocks принимает до 100 sku за запрос
ANALYTICS_STOCKS_BATCH = 100

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


def _ozon_commission_pct(item: dict) -> Optional[Decimal]:
    """Комиссия Ozon в % из ответа /v5/product/info/prices (поле commissions).

    /v5 отдаёт обе ставки (sales_percent_fbo и sales_percent_fbs) для каждого
    товара — это категорийные проценты. Берём FBO как основную (для #5 это
    стартовый дефолт, в UI юнит-экономики редактируется). Нет поля → None
    (комиссия запишется как null, расчёт просто не подставит дефолт).
    """
    comm = item.get("commissions")
    if not isinstance(comm, dict):
        return None
    for key in ("sales_percent_fbo", "sales_percent_fbs", "sales_percent"):
        val = comm.get(key)
        if val not in (None, ""):
            try:
                return Decimal(str(val))
            except (InvalidOperation, ValueError, TypeError):
                return None
    return None


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


def _fetch_fbo_product_info(cli: httpx.Client, client_id: str, api_key: str, product_ids: list[str]) -> dict[str, dict]:
    """offer_id / name / числовой sku по product_id через /v3/product/info/list.

    Для FBO-пайплайна: числовой sku нужен как ключ для /v1/analytics/stocks.
    Ошибка запроса ПРОКИДЫВАЕТСЯ наверх (в отличие от best-effort в _fetch_product_names):
    без sku невозможно получить FBO-остатки, а тихий skip записал бы ложные нули
    (движок бы увидел «обнуление склада» и насчитал ложные продажи).

    Returns:
        {product_id: {"offer_id": str, "name": str | None, "sku": str | None}}
    """
    info_by_pid: dict[str, dict] = {}
    for i in range(0, len(product_ids), INFO_LIST_BATCH):
        batch = product_ids[i : i + INFO_LIST_BATCH]

        def _info_call(b=batch):
            resp = cli.post(
                f"{BASE}/v3/product/info/list",
                headers=_headers(client_id, api_key),
                json={"product_id": b},
            )
            resp.raise_for_status()
            return resp.json()

        data = with_retry(_info_call)
        for item in (data.get("items") or []):
            pid = str(item.get("id") or item.get("product_id") or "")
            if not pid:
                continue
            sku = item.get("sku")
            if not sku:
                # fallback на sources[] — там лежат sku по схемам продаж
                for src in (item.get("sources") or []):
                    if src.get("sku"):
                        sku = src["sku"]
                        break
            name = item.get("name")
            info_by_pid[pid] = {
                "offer_id": str(item.get("offer_id") or pid),
                "name": name.strip() if isinstance(name, str) and name.strip() else None,
                "sku": str(sku) if sku else None,
            }
    logger.info("ozon fbo product info fetched: %d / %d product_ids", len(info_by_pid), len(product_ids))
    return info_by_pid


def _fetch_fbo_analytics_qty(cli: httpx.Client, client_id: str, api_key: str, skus: list[str]) -> dict[str, int]:
    """Остатки FBO через /v1/analytics/stocks (батчи по 100 sku).

    Ответ может содержать несколько записей на один sku (разбивка по
    кластерам/складам Ozon) — суммируем available_stock_count.
    Ошибка запроса ПРОКИДЫВАЕТСЯ наверх: записать ложные нули хуже, чем уронить
    sync (failure_count / auto-pause в main.py отработают штатно).

    Returns:
        {sku: available_qty}
    """
    qty_by_sku: dict[str, int] = {}
    for i in range(0, len(skus), ANALYTICS_STOCKS_BATCH):
        batch = skus[i : i + ANALYTICS_STOCKS_BATCH]

        def _analytics_call(b=batch):
            resp = cli.post(
                f"{BASE}/v1/analytics/stocks",
                headers=_headers(client_id, api_key),
                json={"skus": b},
            )
            resp.raise_for_status()
            return resp.json()

        data = with_retry(_analytics_call)
        for item in (data.get("items") or []):
            sku = str(item.get("sku") or "")
            if not sku:
                continue
            raw = item.get("available_stock_count")
            if raw is None:
                # поле старого отчёта v2/analytics/stock_on_warehouses — на всякий случай
                raw = item.get("free_to_sell_amount")
            try:
                qty = int(raw or 0)
            except (TypeError, ValueError):
                qty = 0
            qty_by_sku[sku] = qty_by_sku.get(sku, 0) + max(0, qty)
    logger.info("ozon fbo analytics stocks fetched: %d sku rows for %d requested", len(qty_by_sku), len(skus))
    return qty_by_sku


def _fetch_snapshots_fbo(client_id: str, api_key: str, page_size: int = 1000) -> list[SnapshotInput]:
    """FBO-пайплайн (июнь 2026): остатки из /v1/analytics/stocks.

    Шаги: /v3/product/list → /v3/product/info/list (offer_id+name+sku) →
    /v1/analytics/stocks (qty по sku) → /v5/product/info/prices.

    Пагинация list и блок prices сознательно продублированы из fetch_snapshots:
    старый fbs/None-путь не тронут ни одной строкой — меньше риск регресса на проде.
    """
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
            logger.warning("ozon /v3/product/list hit MAX_PAGES_PER_BATCH=%d (fbo)", MAX_PAGES_PER_BATCH)

        if not product_ids:
            return []

        # 2. offer_id + name + числовой sku для каждого товара
        info_by_pid = _fetch_fbo_product_info(cli, client_id, api_key, product_ids)

        # 3. FBO-остатки из analytics по числовым sku
        skus = sorted({v["sku"] for v in info_by_pid.values() if v.get("sku")})
        qty_by_sku = _fetch_fbo_analytics_qty(cli, client_id, api_key, skus)

        # 4. Цены через /v5/product/info/prices (best-effort, как в основном пути)
        prices_by_pid: dict[str, Decimal] = {}
        # Параллельные мапы для доп. полей (правки 10): цена продавца (price.price),
        # факт. цена со скидкой (price.marketing_price) — #3, комиссия % — #5.
        # Существующий prices_by_pid (= marketing||price||min) НЕ трогаем: на нём метрики.
        seller_price_by_pid: dict[str, Decimal] = {}
        marketing_by_pid: dict[str, Decimal] = {}
        commission_by_pid: dict[str, Decimal] = {}

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
                    logger.warning("ozon prices fetch failed for batch %d (fbo): %s", i, e)
                    data = {"items": [], "cursor": ""}
                items = data.get("items", [])
                for item in items:
                    pid = str(item.get("product_id") or "")
                    if not pid:
                        continue
                    price_info = item.get("price") or {}
                    raw = price_info.get("marketing_price") or price_info.get("price") or price_info.get("min_price") or "0"
                    prices_by_pid[pid] = _decimal(raw)
                    sp = price_info.get("price")
                    if sp not in (None, "", 0, "0"):
                        seller_price_by_pid[pid] = _decimal(sp)
                    mp = price_info.get("marketing_price")
                    if mp not in (None, "", 0, "0"):
                        marketing_by_pid[pid] = _decimal(mp)
                    comm = _ozon_commission_pct(item)
                    if comm is not None:
                        commission_by_pid[pid] = comm
                new_cursor = data.get("cursor") or ""
                if not new_cursor or new_cursor == cursor or not items:
                    break
                cursor = new_cursor

        # 5. Собираем SnapshotInput. Товар, которого нет в ответе analytics —
        # легитимный ноль (на складах Ozon его нет). sku=offer_id — ключ
        # консистентен с fbs-складом и с products.sku в БД.
        out: list[SnapshotInput] = []
        for pid, info in info_by_pid.items():
            sku_num = info.get("sku")
            out.append(SnapshotInput(
                sku=info["offer_id"],
                product_name=info.get("name"),
                stock_quantity=qty_by_sku.get(sku_num, 0) if sku_num else 0,
                price=prices_by_pid.get(pid, Decimal("0")),
                seller_price=seller_price_by_pid.get(pid),
                marketing_price=marketing_by_pid.get(pid),
                commission_pct=commission_by_pid.get(pid),
                snapshot_time=now,
            ))

        logger.info("ozon fbo fetch done: product_ids=%d, skus=%d, qty_rows=%d, prices=%d, snapshots=%d",
                    len(product_ids), len(skus), len(qty_by_sku), len(prices_by_pid), len(out))

    return out


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
              'fbo' идёт через отдельный пайплайн /v1/analytics/stocks (июнь 2026).
    """
    if kind not in ALLOWED_KINDS:
        raise ValueError(f"Invalid kind={kind!r}, expected one of {ALLOWED_KINDS}")

    if kind == "fbo":
        # Июнь 2026: Ozon перенёс FBO-остатки в /v1/analytics/stocks, /v4 возвращает
        # только FBS/rFBS/FBP — из-за этого склады ozon_fbo и ozon_fbs были идентичны.
        return _fetch_snapshots_fbo(client_id, api_key, page_size)

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
        # Параллельные мапы для доп. полей (правки 10): цена продавца (price.price),
        # факт. цена со скидкой (price.marketing_price) — #3, комиссия % — #5.
        # Существующий prices_by_pid (= marketing||price||min) НЕ трогаем: на нём метрики.
        seller_price_by_pid: dict[str, Decimal] = {}
        marketing_by_pid: dict[str, Decimal] = {}
        commission_by_pid: dict[str, Decimal] = {}

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
                    sp = price_info.get("price")
                    if sp not in (None, "", 0, "0"):
                        seller_price_by_pid[pid] = _decimal(sp)
                    mp = price_info.get("marketing_price")
                    if mp not in (None, "", 0, "0"):
                        marketing_by_pid[pid] = _decimal(mp)
                    comm = _ozon_commission_pct(item)
                    if comm is not None:
                        commission_by_pid[pid] = comm
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
                seller_price=seller_price_by_pid.get(pid),
                marketing_price=marketing_by_pid.get(pid),
                commission_pct=commission_by_pid.get(pid),
                snapshot_time=now,
            ))

        logger.info("ozon fetch done (kind=%s): product_ids=%d, stocks=%d, prices=%d, names=%d, snapshots=%d",
                    kind, len(product_ids), len(stocks_by_pid), len(prices_by_pid), len(names_by_offer), len(out))

    return out
