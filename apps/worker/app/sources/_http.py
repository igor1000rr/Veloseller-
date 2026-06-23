"""HTTP retry helper для marketplace источников. Экспоненциальный backoff."""
from __future__ import annotations
import logging
import random
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Callable, Optional, TypeVar
import httpx

logger = logging.getLogger("veloseller.http")
T = TypeVar("T")


def _parse_retry_after(value: Optional[str], max_delay: float) -> Optional[float]:
    """Парсит заголовок Retry-After (RFC 7231): либо число секунд, либо HTTP-date.

    Возвращает задержку в секундах в диапазоне [0, max_delay] или None, если
    распарсить не удалось. Раньше делалось просто float(value), из-за чего:
      - HTTP-date ('Wed, 21 Oct 2026 07:28:00 GMT') ронял ValueError наружу,
        обрывая весь синк, который retry должен был защитить;
      - огромное число секунд приводило к неограниченному sleep.
    """
    if not value:
        return None
    value = value.strip()
    try:  # 1) число секунд
        return max(0.0, min(max_delay, float(value)))
    except (TypeError, ValueError):
        pass
    try:  # 2) HTTP-date
        dt = parsedate_to_datetime(value)
        if dt is not None:
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            secs = (dt - datetime.now(timezone.utc)).total_seconds()
            return max(0.0, min(max_delay, secs))
    except (TypeError, ValueError, OverflowError):
        pass
    return None


def _backoff_delay(attempt: int, base_delay: float, max_delay: float) -> float:
    """Экспоненциальный backoff с equal jitter.

    Equal jitter (capped/2 + случай в [0, capped/2]) разводит повторы во времени
    против thundering herd, но гарантирует НИЖНИЙ порог задержки. Раньше был full
    jitter (uniform [0, capped]) с нижней границей 0 — повтор мог выстрелить почти
    мгновенно и снова словить 429 в окне WB Statistics (1 req/60s), сжигая все
    попытки внутри одного throttle-окна.
    """
    capped = min(max_delay, base_delay * (2 ** (attempt - 1)))
    half = capped / 2
    return half + random.uniform(0, half)


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
            retry_after = _parse_retry_after(e.response.headers.get("Retry-After"), max_delay)
            delay = retry_after if retry_after is not None else _backoff_delay(attempt, base_delay, max_delay)
            logger.warning(f"HTTP {e.response.status_code}, retry {attempt}/{max_attempts} after {delay:.1f}s")
        except httpx.TransportError as e:
            # TransportError — родитель ConnectError, ReadError, WriteError, ConnectTimeout,
            # ReadTimeout, WriteTimeout, PoolTimeout, RemoteProtocolError, ProxyError и т.д.
            last_exc = e
            delay = _backoff_delay(attempt, base_delay, max_delay)
            logger.warning(f"Network error {type(e).__name__}, retry {attempt}/{max_attempts} after {delay:.1f}s")
        if attempt < max_attempts:
            time.sleep(delay)
    assert last_exc is not None
    raise last_exc
