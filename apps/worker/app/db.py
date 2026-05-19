"""Supabase client (service role — bypass RLS, для worker) + helpers для пагинации."""
from __future__ import annotations

from functools import lru_cache
from supabase import Client, create_client

from app.config import settings


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY должны быть заданы в .env")
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def fetch_all(query_builder, page_size: int = 1000) -> list[dict]:
    """Постранично выгружает ВСЕ строки из Supabase-запроса.

    Supabase REST API режет default до 1000 строк за запрос. Если у селлера
    больше SKU/snapshots/events — нужно использовать .range() для пагинации.

    Использование:
        rows = fetch_all(
            sb.table("products").select("*").eq("seller_id", sid)
        )

    ВАЖНО: передавай query_builder ДО .execute(), без него.
    Каждый вызов range() создаёт новый запрос на сервер.
    """
    all_rows: list[dict] = []
    offset = 0
    while True:
        # range(start, end) inclusive в Supabase
        page = query_builder.range(offset, offset + page_size - 1).execute()
        rows = page.data or []
        all_rows.extend(rows)
        if len(rows) < page_size:
            break
        offset += page_size
        # Safety: не больше 100k записей за раз чтобы не зависнуть
        if offset >= 100_000:
            break
    return all_rows
