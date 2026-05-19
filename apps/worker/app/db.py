"""Supabase client + хелперы для работы с большими таблицами."""
from __future__ import annotations

from typing import Any, Optional
from supabase import Client, create_client

from app.config import settings

_client: Optional[Client] = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    return _client


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
