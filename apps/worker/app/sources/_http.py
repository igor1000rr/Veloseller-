"""HTTP retry helper для marketplace источников. Экспоненциальный backoff."""
from __future__ import annotations
import time
import logging
from typing import Callable, TypeVar
import httpx

logger = logging.getLogger("veloseller.http")
T = TypeVar("T")


def with_retry(
    fn: Callable[[], T],
    max_attempts: int = 4,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    retry_on_status: tuple[int, ...] = (429, 500, 502, 503, 504),
) -> T:
    """Вызывает fn() с экспоненциальным backoff на сетевые ошибки и retry-statuses.

    WB rate-limit 1 req/60s — для него передавайте max_delay=120 при необходимости.

    БАГ 22 fix: ловим httpx.TransportError (родитель всех transport-ошибок),
    раньше только ConnectError/ReadTimeout/RemoteProtocolError — ConnectTimeout,
    WriteError, PoolTimeout НЕ покрывались и пробрасывались наверх без retry.
    """
    last_exc: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            return fn()
        except httpx.HTTPStatusError as e:
            last_exc = e
            if e.response.status_code not in retry_on_status:
                raise
            retry_after = e.response.headers.get("Retry-After")
            delay = float(retry_after) if retry_after else min(max_delay, base_delay * (2 ** (attempt - 1)))
            logger.warning(f"HTTP {e.response.status_code}, retry {attempt}/{max_attempts} after {delay:.1f}s")
        except httpx.TransportError as e:
            # TransportError — родитель ConnectError, ReadError, WriteError, ConnectTimeout,
            # ReadTimeout, WriteTimeout, PoolTimeout, RemoteProtocolError, ProxyError и т.д.
            last_exc = e
            delay = min(max_delay, base_delay * (2 ** (attempt - 1)))
            logger.warning(f"Network error {type(e).__name__}, retry {attempt}/{max_attempts} after {delay:.1f}s")
        if attempt < max_attempts:
            time.sleep(delay)
    assert last_exc is not None
    raise last_exc
