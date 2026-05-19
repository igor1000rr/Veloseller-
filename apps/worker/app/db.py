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


# Лимит на pagination: 1M строк. С 1000 на страницу это 1000 итераций — около минуты.
# Реалистичный максимум для одного селлера: 1879 SKU × 365 дней = ~700K snapshot'ов
# за год. БАГ 23 fix: было 100K, что обрезало большие исторические выгрузки.
_FETCH_ALL_MAX_ROWS = 1_000_000


def fetch_all(query_builder, page_size: int = 1000) -> list[dict]:
    """Постранично выгружает ВСЕ строки из Supabase-запроса.

    Supabase REST API режет default до 1000 строк за запрос. Если у селлера
    больше SKU/snapshots/events — нужно использовать .range() для пагинации.

    Использование:
        rows = fetch_all(
            sb.table("products").select("*").eq("seller_id", sid)
        )

    ВАЖНО: передавай query_builder ДО .execute(), без него.

    Defensive: если query_builder не имеет реального .range() (MagicMock-моки
    в старых тестах) — fallback на обычный .execute().
    """
    range_attr = getattr(query_builder, "range", None)
    if range_attr is None or not callable(range_attr):
        result = query_builder.execute()
        return list(result.data or [])

    try:
        page = query_builder.range(0, page_size - 1).execute()
    except (AttributeError, TypeError):
        result = query_builder.execute()
        return list(result.data or [])

    rows = page.data or []
    try:
        length = len(rows)
        first_iter = list(rows) if length else []
    except TypeError:
        result = query_builder.execute()
        return list(result.data or [])

    all_rows: list[dict] = list(first_iter)
    if length < page_size:
        return all_rows

    offset = page_size
    while offset < _FETCH_ALL_MAX_ROWS:
        page = query_builder.range(offset, offset + page_size - 1).execute()
        rows = page.data or []
        try:
            length = len(rows)
        except TypeError:
            break
        all_rows.extend(rows)
        if length < page_size:
            break
        offset += page_size
    return all_rows
