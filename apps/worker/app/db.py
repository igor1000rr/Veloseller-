"""Supabase client (service role — bypass RLS, для worker) + helpers для пагинации."""
from __future__ import annotations

import logging
import time
from functools import lru_cache

import httpx
from supabase import Client, create_client

from app.config import settings

logger = logging.getLogger("veloseller.db")


class _RetryingTransport(httpx.HTTPTransport):
    """HTTP transport с автоматическим retry на RemoteProtocolError.

    БАГ 91: даже после перехода на HTTP/1.1 (БАГ 84) Postgrest закрывает idle
    connections со своей стороны после ~5-10с (keep-alive timeout). httpx
    pool думает что connection живой и переиспользует — отправляет request
    на закрытое соединение → "Server disconnected without sending a response".

    Этот transport ловит RemoteProtocolError на idempotent методах (GET/HEAD/PUT
    /DELETE — а также POST/PATCH когда мы уверены в идемпотентности через
    upsert/dedup в БД) и повторяет до 3 раз. Поскольку pool на retry создаёт
    новое соединение, проблема не повторяется.
    """

    _MAX_RETRIES = 3
    _BACKOFF_SECONDS = (0.2, 0.5, 1.0)

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        last_exc: Exception | None = None
        for attempt in range(self._MAX_RETRIES):
            try:
                return super().handle_request(request)
            except httpx.RemoteProtocolError as e:
                last_exc = e
                # Retry на ВСЕ типы запросов (POST/PATCH тоже): recalc upsert'ит
                # tvelo_metrics, delete+insert inventory_events/changelog —
                # повторный запрос даёт тот же эффект.
                if attempt < self._MAX_RETRIES - 1:
                    logger.warning(
                        "postgrest connection dropped, retry %d/%d (%s %s)",
                        attempt + 1, self._MAX_RETRIES,
                        request.method, str(request.url)[:120],
                    )
                    time.sleep(self._BACKOFF_SECONDS[attempt])
                    continue
                raise
        raise last_exc  # type: ignore[misc]


def _force_http11_on_postgrest(client: Client) -> None:
    """БАГ 84 + 91: переоткрываем httpx-сессию postgrest с HTTP/1.1 +
    коротким keepalive_expiry + retry transport.

    БАГ 84: HTTP/2 у Postgrest закрывает GOAWAY после ~20K stream'ов.
    БАГ 91: на HTTP/1.1 Postgrest закрывает idle connection через ~5-10с,
    httpx pool ловит RemoteProtocolError при следующем запросе.

    Решение:
    1. http2=False — снимает GOAWAY-лимит.
    2. keepalive_expiry=4s — httpx сам закрывает idle connections до того
       как это сделает Postgrest (типичный server-side timeout 5-10с).
    3. _RetryingTransport — даже если race случится, автоматический retry
       с новым connection.

    Поддерживаем две версии postgrest-py: атрибут `session` или `_session`.
    """
    try:
        pg = client.postgrest
        old = getattr(pg, "session", None) or getattr(pg, "_session", None)
        if old is None or not isinstance(old, httpx.Client):
            logger.warning("postgrest session attribute not found, skipping HTTP/1.1 patch")
            return
        base_url = str(old.base_url)
        headers = dict(old.headers)
        new_session = httpx.Client(
            base_url=base_url,
            headers=headers,
            timeout=httpx.Timeout(60.0),
            http2=False,
            transport=_RetryingTransport(http2=False),
            limits=httpx.Limits(
                max_connections=20,
                max_keepalive_connections=5,
                keepalive_expiry=4.0,
            ),
        )
        old.close()
        if hasattr(pg, "session"):
            pg.session = new_session
        if hasattr(pg, "_session"):
            pg._session = new_session
        logger.info("postgrest session patched: HTTP/1.1 + retry transport + keepalive 4s")
    except Exception as e:
        logger.warning("HTTP/1.1 patch failed: %s", e)


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY должны быть заданы в .env")
    client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    _force_http11_on_postgrest(client)
    return client


def execute_minimal(query_builder):
    """Выполняет write-запрос (insert/update/delete/upsert) с Prefer: return=minimal.

    ЭКОНОМИЯ EGRESS (инцидент 05.06.2026 — exceed_egress_quota): supabase-py
    по умолчанию шлёт Prefer: return=representation, и PostgREST возвращает
    в теле ответа ВСЕ затронутые строки. Recalc делает десятки тысяч
    delete/insert/upsert за пересчёт — тела ответов гоняли гигабайты
    обратно в worker и сожгли egress-квоту проекта.

    return=minimal → PostgREST отвечает пустым телом. Остальные Prefer-токены
    (resolution=merge-duplicates у upsert и т.п.) сохраняются.

    Defensive (как fetch_all): если у builder'а нет реальных headers
    (MagicMock / fake-моки в тестах) — молча выполняем как есть, деградация
    к representation, поведение не меняется.

    Использовать ТОЛЬКО там, где результат .execute() не читается.
    """
    try:
        headers = query_builder.headers
        prefer = headers.get("Prefer", "") or ""
        parts = [
            p.strip() for p in str(prefer).split(",")
            if p.strip() and not p.strip().startswith("return=")
        ]
        parts.append("return=minimal")
        headers["Prefer"] = ",".join(parts)
    except Exception:
        pass
    return query_builder.execute()


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
