"""Диагностика Ozon API stocks — выясняет какие значения 'type' возвращает
/v4/product/info/stocks для конкретного клиента, чтобы понять почему наш
фильтр fbo/fbs перестал работать после 25-26 мая 2026.

Использование:
    cd /opt/veloseller-worker
    source venv/bin/activate
    python -m app.diagnostics.ozon_stocks_inspect \\
        --client-id <CLIENT_ID> --api-key <API_KEY> --offer-id WB0801120

Если offer-id не указан — возьмёт первые 5 SKU и покажет stocks по каждому.
Выводит RAW JSON ответа без редактирования.
"""
from __future__ import annotations
import argparse
import json
import sys
import httpx

BASE = "https://api-seller.ozon.ru"


def _headers(client_id: str, api_key: str) -> dict[str, str]:
    return {"Client-Id": client_id, "Api-Key": api_key, "Content-Type": "application/json"}


def fetch_first_product_ids(cli, client_id, api_key, limit=5) -> list[str]:
    resp = cli.post(
        f"{BASE}/v3/product/list",
        headers=_headers(client_id, api_key),
        json={"filter": {"visibility": "ALL"}, "last_id": "", "limit": limit},
    )
    resp.raise_for_status()
    items = resp.json().get("result", {}).get("items", [])
    return [str(i["product_id"]) for i in items]


def fetch_stocks_raw(cli, client_id, api_key, product_ids) -> dict:
    resp = cli.post(
        f"{BASE}/v4/product/info/stocks",
        headers=_headers(client_id, api_key),
        json={"filter": {"product_id": product_ids, "visibility": "ALL"}, "cursor": "", "limit": 1000},
    )
    resp.raise_for_status()
    return resp.json()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--client-id", required=True)
    ap.add_argument("--api-key", required=True)
    ap.add_argument("--offer-id", help="Если указан — ищем по offer_id (sku); иначе берём первые 5 SKU.")
    args = ap.parse_args()

    with httpx.Client(timeout=60.0) as cli:
        if args.offer_id:
            # Найти product_id по offer_id через /v3/product/info/list
            r = cli.post(
                f"{BASE}/v3/product/info/list",
                headers=_headers(args.client_id, args.api_key),
                json={"offer_id": [args.offer_id]},
            )
            r.raise_for_status()
            items = r.json().get("items", [])
            if not items:
                print(f"offer_id {args.offer_id} не найден")
                sys.exit(1)
            product_ids = [str(items[0]["id"])]
        else:
            product_ids = fetch_first_product_ids(cli, args.client_id, args.api_key, limit=5)
            print(f"Первые 5 product_ids: {product_ids}\n")

        raw = fetch_stocks_raw(cli, args.client_id, args.api_key, product_ids)

    print("=" * 70)
    print("RAW ответ /v4/product/info/stocks:")
    print("=" * 70)
    print(json.dumps(raw, indent=2, ensure_ascii=False))
    print("=" * 70)

    # Анализ stocks[].type
    print("\nАнализ stocks[].type по каждому товару:")
    print("-" * 70)
    for item in raw.get("items", []):
        pid = item.get("product_id")
        offer = item.get("offer_id", "")
        stocks = item.get("stocks", [])
        print(f"\nproduct_id={pid} offer_id={offer}")
        if not stocks:
            print("  (нет stocks)")
            continue
        for s in stocks:
            t = s.get("type", "<отсутствует>")
            present = s.get("present", 0)
            reserved = s.get("reserved", 0)
            print(f"  type={t!r:15} present={present:5} reserved={reserved:5} available={present-reserved}")


if __name__ == "__main__":
    main()
