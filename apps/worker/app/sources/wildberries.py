"""Wildberries Statistics API + Content API + Marketplace API (FBS).

Statistics API (statistics-api.wildberries.ru):
  - /api/v1/supplier/stocks — остатки и цены FBO. Rate-limit 1 req/60s.

Content API (content-api.wildberries.ru):
  - /content/v2/get/cards/list — карточки товаров с реальным name + skus[] баркоды.
    Rate-limit: 100 req/min с тем же токеном.

Marketplace API (marketplace-api.wildberries.ru) — май 2026, multi-warehouse:
  - /api/v3/warehouses — список FBS-складов продавца.
  - /api/v3/stocks/{warehouseId} — остатки по баркодам на конкретном FBS-складе.
Токен FBS должен иметь категории: Статистика + Маркетплейс + Контент.

БАГ 104 fix: product_name тянется из Content API title вместо subject (категория).
"""
from __future__ import annotations
import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import httpx
from app.schemas import SnapshotInput
from app.sources._http import with_retry

logger = logging.getLogger("veloseller.wb")

STOCKS_URL = "https://statistics-api.wildberries.ru/api/v1/supplier/stocks"
CARDS_URL = "https://content-api.wildberries.ru/content/v2/get/cards/list"
MARKETPLACE_API = "https://marketplace-api.wildberries.ru"
# Discounts-Prices API — цены по ВСЕМ товарам (FBO+FBS), в отличие от Statistics
# /supplier/stocks (только товары с FBO-остатком). Требует категорию «Цены и скидки».
PRICES_URL = "https://discounts-prices-api.wildberries.ru/api/v2/list/goods/filter"
PRICES_PAGE_LIMIT = 1000

CARDS_PAGE_SIZE = 100
MAX_CARDS_PAGES = 1000
# FBS stocks API ограничение на размер batch'а SKUs
FBS_STOCKS_BATCH = 1000


def _fetch_card_data(cli: httpx.Client, token: str, with_skus: bool = False) -> tuple[dict[str, str], dict[str, list[str]], dict[str, str], dict[str, str]]:
    """Тянем все карточки продавца через Content API.

    Returns:
        names: {vendorCode: title}
        skus_map: {vendorCode: [barcode1, barcode2, ...]} — пустой если with_skus=False.

    Баркоды (skus) нужны для FBS-остатков через Marketplace API — оно работает по баркодам,
    а не по supplierArticle. FBO Statistics API работает по supplierArticle, баркоды не нужны.
    """
    names: dict[str, str] = {}
    skus_map: dict[str, list[str]] = {}
    subjects: dict[str, str] = {}
    brands: dict[str, str] = {}
    cursor_updated_at = None
    cursor_nm_id = None
    pages = 0

    while pages < MAX_CARDS_PAGES:
        pages += 1
        settings_cursor: dict = {"limit": CARDS_PAGE_SIZE}
        if cursor_updated_at and cursor_nm_id:
            settings_cursor["updatedAt"] = cursor_updated_at
            settings_cursor["nmID"] = cursor_nm_id

        payload = {
            "settings": {
                "cursor": settings_cursor,
                "filter": {"withPhoto": -1},
            }
        }

        def _call(p=payload):
            resp = cli.post(CARDS_URL, headers={"Authorization": token}, json=p, timeout=60.0)
            resp.raise_for_status()
            return resp.json()

        try:
            data = with_retry(_call, base_delay=10.0, max_delay=60.0)
        except Exception as e:
            logger.warning("WB /content/v2/get/cards/list failed on page %d: %s", pages, e)
            break

        cards = data.get("cards") or []
        # DIAG (временно, инцидент WB FBS 11.06.2026): фиксируем форму ответа
        # Content API по 1-й странице FBS — нужно понять, почему пусты
        # subjectName/brand и откуда задвоенный vendorCode. Только чтение.
        if with_skus and pages == 1:
            try:
                _fetch_card_data.last_fbs_debug = {
                    "card0_keys": sorted((cards[0] or {}).keys()) if cards else [],
                    "cards_count_page1": len(cards),
                    "first_cards": [
                        {k: c.get(k) for k in ("vendorCode", "subjectID", "subjectName", "brand", "title", "nmID")}
                        for c in cards[:5]
                    ],
                }
            except Exception:
                pass
        for card in cards:
            vendor_code = (card.get("vendorCode") or "").strip()
            title = (card.get("title") or "").strip()
            if vendor_code and title:
                names[vendor_code] = title
            if vendor_code:
                subj = (card.get("subjectName") or "").strip()
                if subj and vendor_code not in subjects:
                    subjects[vendor_code] = subj
                brand = (card.get("brand") or "").strip()
                if brand and vendor_code not in brands:
                    brands[vendor_code] = brand
            if with_skus and vendor_code:
                # Каждый размер (sizes[]) имеет свои баркоды (skus[])
                for size in (card.get("sizes") or []):
                    for barcode in (size.get("skus") or []):
                        if barcode:
                            skus_map.setdefault(vendor_code, []).append(str(barcode).strip())

        next_cursor = data.get("cursor") or {}
        total = int(next_cursor.get("total") or 0)
        if total < CARDS_PAGE_SIZE:
            break

        new_updated_at = next_cursor.get("updatedAt")
        new_nm_id = next_cursor.get("nmID")
        if not new_updated_at or not new_nm_id:
            break
        if new_updated_at == cursor_updated_at and new_nm_id == cursor_nm_id:
            break
        cursor_updated_at = new_updated_at
        cursor_nm_id = new_nm_id

    if pages >= MAX_CARDS_PAGES:
        logger.warning("WB cards fetch hit MAX_CARDS_PAGES=%d", MAX_CARDS_PAGES)

    logger.info("WB cards fetched: %d, with_skus=%s", len(names), with_skus)
    return names, skus_map, subjects, brands


def _fetch_card_names(cli: httpx.Client, token: str) -> dict[str, str]:
    """Legacy shim — без баркодов, для старых вызовов в fetch_snapshots."""
    names, _, _, _ = _fetch_card_data(cli, token, with_skus=False)
    return names


COMMISSION_URL = "https://common-api.wildberries.ru/api/v1/tariffs/commission"


def _fetch_wb_commission(cli: httpx.Client, token: str) -> dict[str, dict]:
    """Комиссия WB по предмету (subjectName) из Tariffs API (#5).

    Returns: {subject_name.lower(): {"fbo": Decimal|None, "fbs": Decimal|None}}.
      fbo = kgvpSupplier  (продажа со склада WB),
      fbs = kgvpMarketplace (продажа со склада продавца).
    Ключ — предмет (его же пишем в category), поэтому в снапшоте резолвим по subject.
    Best-effort: при ошибке (в т.ч. если у токена нет категории «Тарифы») — пустая
    карта, комиссия останется null, в юнит-экономике это просто ручной ввод.
    """
    out: dict[str, dict] = {}
    try:
        def _call():
            resp = cli.get(COMMISSION_URL, params={"locale": "ru"},
                           headers={"Authorization": token}, timeout=30.0)
            resp.raise_for_status()
            return resp.json() or {}
        data = with_retry(_call, base_delay=5.0, max_delay=30.0)
        report = data.get("report")
        if not report and isinstance(data.get("data"), dict):
            report = data["data"].get("report")
        def _dec(v):
            if v in (None, ""):
                return None
            try:
                return Decimal(str(v))
            except Exception:
                return None
        for r in (report or []):
            subj = (r.get("subjectName") or "").strip().lower()
            if not subj:
                continue
            out[subj] = {"fbo": _dec(r.get("kgvpSupplier")), "fbs": _dec(r.get("kgvpMarketplace"))}
        logger.info("WB commission tariffs: %d subjects", len(out))
    except Exception as e:
        logger.warning("WB tariffs/commission fetch failed: %s", e)
    return out


def _fetch_wb_prices(cli: httpx.Client, token: str) -> dict[str, tuple[Decimal, Decimal]]:
    """Цены ВСЕХ товаров продавца (FBO+FBS) через Discounts-Prices API v2.

    Statistics API /supplier/stocks отдаёт цену только для товаров с FBO-остатком,
    поэтому у чисто FBS-товаров (нет на складе WB) цена там отсутствует. Этот
    endpoint возвращает цену по каждому товару независимо от схемы продажи.

    Returns: {vendorCode: (nominal_price, discount_pct)} (Decimal).
    Требует у токена категорию «Цены и скидки». Best-effort: при ошибке — {}.
    """
    out: dict[str, tuple[Decimal, Decimal]] = {}
    offset = 0
    pages = 0
    try:
        while pages < MAX_CARDS_PAGES:
            pages += 1

            def _call(off=offset):
                resp = cli.get(
                    PRICES_URL,
                    params={"limit": PRICES_PAGE_LIMIT, "offset": off},
                    headers={"Authorization": token},
                    timeout=30.0,
                )
                resp.raise_for_status()
                return resp.json() or {}

            data = with_retry(_call, base_delay=5.0, max_delay=30.0)
            goods = ((data.get("data") or {}).get("listGoods")) or []
            if not goods:
                break
            for g in goods:
                vendor = (g.get("vendorCode") or "").strip()
                if not vendor or vendor in out:
                    continue
                nominal = None
                for s in (g.get("sizes") or []):
                    pv = s.get("price")
                    if pv:
                        nominal = Decimal(str(pv))
                        break
                if nominal is None:
                    continue
                try:
                    disc = Decimal(str(g.get("discount") or 0))
                except Exception:
                    disc = Decimal("0")
                out[vendor] = (nominal, disc)
            if len(goods) < PRICES_PAGE_LIMIT:
                break
            offset += PRICES_PAGE_LIMIT
        logger.info("WB discounts-prices: %d vendorCodes", len(out))
    except Exception as e:
        logger.warning("WB discounts-prices fetch failed: %s", e)
    return out


def fetch_snapshots(token: str) -> list[SnapshotInput]:
    """FBO snapshots (склады WB) через Statistics API."""
    now = datetime.now(timezone.utc)
    date_from = (now - timedelta(days=1)).isoformat(timespec="seconds")

    with httpx.Client(timeout=120.0) as cli:
        def _stocks_call():
            resp = cli.get(STOCKS_URL, params={"dateFrom": date_from}, headers={"Authorization": token})
            resp.raise_for_status()
            return resp.json() or []

        rows = with_retry(_stocks_call, base_delay=60.0, max_delay=300.0)
        names_by_vendor = _fetch_card_names(cli, token)
        commission_map = _fetch_wb_commission(cli, token)

    grouped: dict[str, dict] = defaultdict(lambda: {"qty": 0, "price": Decimal("0"), "discount": Decimal("0"), "subject": None, "brand": None})
    for r in rows:
        sku = (r.get("supplierArticle") or "").strip()
        if not sku:
            continue
        grouped[sku]["qty"] += int(r.get("quantityFull") or 0)
        price = r.get("Price") or 0
        if price and grouped[sku]["price"] == 0:
            grouped[sku]["price"] = Decimal(str(price))
            # Discount берём из той же строки, что и цену — чтобы пара была согласована.
            disc = r.get("Discount") or 0
            try:
                grouped[sku]["discount"] = Decimal(str(disc))
            except Exception:
                grouped[sku]["discount"] = Decimal("0")
        if not grouped[sku]["subject"]:
            grouped[sku]["subject"] = r.get("subject")
        if not grouped[sku]["brand"]:
            grouped[sku]["brand"] = r.get("brand")

    snapshots = []
    name_found = 0
    name_from_subject = 0
    for sku, v in grouped.items():
        real_name = names_by_vendor.get(sku)
        if real_name:
            product_name = real_name
            name_found += 1
        elif v["subject"]:
            product_name = v["subject"]
            name_from_subject += 1
        else:
            product_name = None
        nominal = v["price"]
        disc = v.get("discount") or Decimal("0")
        # Факт. цена WB = Price*(1 - Discount/100), округление до копеек.
        marketing = (nominal * (Decimal("1") - disc / Decimal("100"))).quantize(Decimal("0.01")) if nominal else Decimal("0")
        subj_key = (v.get("subject") or "").lower()
        comm = commission_map.get(subj_key, {}).get("fbo") if subj_key else None
        snapshots.append(SnapshotInput(
            sku=sku,
            product_name=product_name,
            stock_quantity=max(0, v["qty"]),
            price=nominal,
            seller_price=nominal,
            marketing_price=marketing,
            commission_pct=comm,
            brand=(v.get("brand") or None),
            category=(v.get("subject") or None),
            snapshot_time=now,
        ))

    logger.info(
        "WB FBO fetch done: stocks_rows=%d, snapshots=%d, names_from_cards=%d, names_from_subject=%d",
        len(rows), len(snapshots), name_found, name_from_subject,
    )
    return snapshots


# ============== FBS (Marketplace API) ==============

def _fetch_fbs_warehouses(cli: httpx.Client, token: str) -> list[dict]:
    """GET /api/v3/warehouses — список FBS-складов продавца.

    Returns: список складов с полями id, name, officeId, cargoType, deliveryType.
    При ошибке — выбрасываем наверх (синк должен упасть, это критичный endpoint).
    """
    def _call():
        resp = cli.get(
            f"{MARKETPLACE_API}/api/v3/warehouses",
            headers={"Authorization": token},
            timeout=30.0,
        )
        resp.raise_for_status()
        return resp.json() or []
    return with_retry(_call, base_delay=5.0, max_delay=30.0)


def _fetch_fbs_stocks(cli: httpx.Client, token: str, warehouse_id: int, skus: list[str]) -> dict[str, int]:
    """POST /api/v3/stocks/{warehouseId} — остатки по баркодам на конкретном FBS-складе.

    Body: {"skus": [barcode1, ...]}
    Response: {"stocks": [{"sku": barcode, "amount": qty}]}

    Батчим по FBS_STOCKS_BATCH=1000 — API имеет лимит на размер body.

    Returns: {barcode: amount}. Если batch упал — пропускаем с warning, идём дальше.
    """
    if not skus:
        return {}
    result: dict[str, int] = {}
    for i in range(0, len(skus), FBS_STOCKS_BATCH):
        batch = skus[i:i + FBS_STOCKS_BATCH]
        def _call(b=batch):
            resp = cli.post(
                f"{MARKETPLACE_API}/api/v3/stocks/{warehouse_id}",
                headers={"Authorization": token},
                json={"skus": b},
                timeout=60.0,
            )
            resp.raise_for_status()
            return resp.json() or {}
        try:
            data = with_retry(_call, base_delay=5.0, max_delay=30.0)
        except Exception as e:
            logger.warning("WB FBS stocks batch failed for warehouse %d (batch %d): %s",
                           warehouse_id, i // FBS_STOCKS_BATCH, e)
            continue
        for item in (data.get("stocks") or []):
            barcode = (item.get("sku") or "").strip()
            amount = int(item.get("amount") or 0)
            if barcode:
                result[barcode] = amount
    return result


def fetch_fbs_snapshots(token: str) -> list[SnapshotInput]:
    """FBS snapshots (ваш склад) через Marketplace API.

    Flow:
    1. Content API → карточки с vendorCode + title + skus (баркоды)
    2. Statistics API → цены (цены одинаковые для FBO и FBS)
    3. Marketplace /api/v3/warehouses → список FBS-складов
    4. По каждому FBS-складу → /api/v3/stocks/{warehouseId} с barcode batch'ами
    5. Агрегируем по vendorCode (один товар = несколько баркодов размеров)

    Требует token с правами: Статистика + Маркетплейс + Контент.
    """
    now = datetime.now(timezone.utc)
    date_from = (now - timedelta(days=1)).isoformat(timespec="seconds")

    with httpx.Client(timeout=120.0) as cli:
        # 1. Карточки с баркодами (самый важный шаг — без этого не работает)
        names_by_vendor, skus_by_vendor, subjects_by_card, brands_by_card = _fetch_card_data(cli, token, with_skus=True)
        if not names_by_vendor:
            logger.warning("WB FBS: no cards found from Content API — nothing to fetch")
            return []
        commission_map = _fetch_wb_commission(cli, token)
        # Цены по ВСЕМ товарам (FBO+FBS) — Statistics /supplier/stocks ниже даёт цену
        # лишь для товаров с FBO-остатком, поэтому здесь добираем цены по vendorCode.
        prices_disc = _fetch_wb_prices(cli, token)

        # Обратный маппинг: barcode → vendorCode (для агрегации остатков по supplierArticle)
        barcode_to_vendor: dict[str, str] = {}
        all_barcodes: list[str] = []
        for vendor_code, barcodes in skus_by_vendor.items():
            for barcode in barcodes:
                barcode_to_vendor[barcode] = vendor_code
                all_barcodes.append(barcode)

        if not all_barcodes:
            logger.warning("WB FBS: no barcodes in cards — nothing to fetch stocks for")
            return []

        # 2. Цены через Statistics API (FBO+FBS имеют единую цену на маркетплейсе)
        prices_by_vendor: dict[str, Decimal] = {}
        discount_by_vendor: dict[str, Decimal] = {}
        brand_by_vendor: dict[str, str] = {}
        subject_by_vendor: dict[str, str] = {}
        try:
            def _stocks_call():
                resp = cli.get(STOCKS_URL, params={"dateFrom": date_from},
                               headers={"Authorization": token})
                resp.raise_for_status()
                return resp.json() or []
            rows = with_retry(_stocks_call, base_delay=60.0, max_delay=300.0)
            for r in rows:
                vendor = (r.get("supplierArticle") or "").strip()
                if not vendor:
                    continue
                price = r.get("Price") or 0
                if price and vendor not in prices_by_vendor:
                    prices_by_vendor[vendor] = Decimal(str(price))
                    disc = r.get("Discount") or 0
                    try:
                        discount_by_vendor[vendor] = Decimal(str(disc))
                    except Exception:
                        discount_by_vendor[vendor] = Decimal("0")
                if vendor not in brand_by_vendor and r.get("brand"):
                    brand_by_vendor[vendor] = r.get("brand")
                if vendor not in subject_by_vendor and r.get("subject"):
                    subject_by_vendor[vendor] = r.get("subject")
        except Exception as e:
            # Не критично — без цен snapshots сохранятся, только без потерянной выручки в расчёте
            logger.warning("WB FBS: Statistics API for prices failed: %s", e)

        # 3. Список FBS-складов
        warehouses = _fetch_fbs_warehouses(cli, token)
        if not warehouses:
            logger.warning("WB FBS: no warehouses found via /api/v3/warehouses")
            # Возвращаем snapshots с 0 остатками — это валидное состояние (юзер ещё не создал FBS-склад)
            return _build_zero_stock_snapshots(names_by_vendor, prices_by_vendor, now)

        # 4. По каждому FBS-складу — остатки по barcode'ам
        stocks_by_vendor: dict[str, int] = defaultdict(int)
        for wh in warehouses:
            wh_id = wh.get("id")
            if not wh_id:
                continue
            wh_stocks = _fetch_fbs_stocks(cli, token, wh_id, all_barcodes)
            for barcode, amount in wh_stocks.items():
                vendor = barcode_to_vendor.get(barcode)
                if vendor:
                    stocks_by_vendor[vendor] += amount

    # 5. Собираем snapshots по всем карточкам
    snapshots = []
    for vendor_code, title in names_by_vendor.items():
        qty = stocks_by_vendor.get(vendor_code, 0)
        # Цена: приоритет Discounts-Prices (есть у всех товаров), фолбэк — Statistics.
        if vendor_code in prices_disc:
            price, disc = prices_disc[vendor_code]
        else:
            price = prices_by_vendor.get(vendor_code, Decimal("0"))
            disc = discount_by_vendor.get(vendor_code, Decimal("0"))
        marketing = (price * (Decimal("1") - disc / Decimal("100"))).quantize(Decimal("0.01")) if price else Decimal("0")
        # Предмет/бренд: приоритет карточкам Content API (есть у всех), фолбэк — Statistics.
        subject = subjects_by_card.get(vendor_code) or subject_by_vendor.get(vendor_code)
        brand = brands_by_card.get(vendor_code) or brand_by_vendor.get(vendor_code)
        subj_key = (subject or "").lower()
        comm = commission_map.get(subj_key, {}).get("fbs") if subj_key else None
        snapshots.append(SnapshotInput(
            sku=vendor_code,
            product_name=title or vendor_code,
            stock_quantity=max(0, qty),
            price=price,
            seller_price=(price if price else None),
            marketing_price=(marketing if price else None),
            commission_pct=comm,
            brand=(brand or None),
            category=(subject or None),
            snapshot_time=now,
        ))

    logger.info(
        "WB FBS fetch done: warehouses=%d, cards=%d, with_stock=%d, with_price=%d, total_barcodes=%d",
        len(warehouses), len(snapshots),
        sum(1 for v in stocks_by_vendor.values() if v > 0),
        len(set(prices_disc) | set(prices_by_vendor)), len(all_barcodes),
    )
    return snapshots


def _build_zero_stock_snapshots(
    names_by_vendor: dict[str, str],
    prices_by_vendor: dict[str, Decimal],
    now: datetime,
) -> list[SnapshotInput]:
    """Собираем snapshots с qty=0 для всех карточек когда у продавца 0 FBS-складов."""
    return [
        SnapshotInput(
            sku=vendor_code,
            product_name=title or vendor_code,
            stock_quantity=0,
            price=prices_by_vendor.get(vendor_code, Decimal("0")),
            snapshot_time=now,
        )
        for vendor_code, title in names_by_vendor.items()
    ]
