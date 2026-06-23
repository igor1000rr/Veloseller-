"""Suggest провайдеры — WB и OZON.

Проверяют, искабельна ли фраза в маркетплейсе (это подтверждение запроса
на покупку, отличающее "интерес" от "уже покупают").

Оба эндпоинта публичные, без авторизации. Риск rate-limit/блокировки —
ставим retry с backoff. Если упрутся — добавим прокси (env-переменная
HTTP_PROXY).

ENV переменные:
  HTTP_PROXY (необязательно) — прокси для suggest-запросов
"""
from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests

from app.db import get_supabase

logger = logging.getLogger("veloseller.radar.suggest")

_HTTP_RETRY_MAX = 3
_HTTP_RETRY_BACKOFF_SEC = 1.5
_REQUEST_TIMEOUT_SEC = 15.0
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


@dataclass
class SuggestResult:
    """Результат проверки одной фразы в одном маркетплейсе."""
    phrase: str
    marketplace: str  # "wb" | "ozon"
    present: bool     # есть ли suggest-результаты
    suggestions: list[str] = field(default_factory=list)
    fetched_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


def _proxies() -> Optional[dict[str, str]]:
    """Если задан HTTP_PROXY — возвращает dict для requests."""
    proxy = os.getenv("HTTP_PROXY", "").strip()
    if not proxy:
        return None
    return {"http": proxy, "https": proxy}


def _http_get_with_retry(url: str, *, params: Optional[dict] = None,
                          headers: Optional[dict] = None) -> requests.Response:
    """GET с retry/backoff для нестабильных публичных эндпоинтов."""
    headers = headers or {}
    headers.setdefault("User-Agent", _USER_AGENT)
    last_err: Optional[Exception] = None
    for attempt in range(_HTTP_RETRY_MAX):
        try:
            resp = requests.get(
                url, params=params, headers=headers,
                proxies=_proxies(), timeout=_REQUEST_TIMEOUT_SEC,
            )
            if resp.status_code in (403, 429):
                last_err = RuntimeError(f"{resp.status_code} rate-limit on {url}")
                time.sleep(_HTTP_RETRY_BACKOFF_SEC * (attempt + 1))
                continue
            resp.raise_for_status()
            return resp
        except requests.exceptions.RequestException as e:
            last_err = e
            if attempt < _HTTP_RETRY_MAX - 1:
                time.sleep(_HTTP_RETRY_BACKOFF_SEC * (attempt + 1))
                continue
            raise
    if last_err:
        raise last_err
    raise RuntimeError("suggest GET: unknown error")


def check_wb_suggest(phrase: str) -> SuggestResult:
    """Wildberries поисковые подсказки.

    Эндпоинт: search.wb.ru/suggests/v2/common?query=...
    Публичный, без авторизации. Возвращает массив строк suggest'ов.

    Считаем present=True если есть хотя бы одна подсказка, содержащая
    наше слово (не просто "люди ищут такое").
    """
    phrase_norm = phrase.strip()
    if not phrase_norm:
        return SuggestResult(phrase=phrase, marketplace="wb", present=False)

    try:
        resp = _http_get_with_retry(
            "https://search.wb.ru/suggests/v2/common",
            params={
                "query": phrase_norm,
                "lang": "ru",
                "locale": "ru",
                "appType": 1,
                "TestGroup": "no_test",
            },
        )
        data = resp.json()
    except Exception as e:
        logger.warning("wb suggest failed for %r: %s", phrase, e)
        return SuggestResult(phrase=phrase, marketplace="wb", present=False)

    # WB возвращает либо [{"name": "..."}, ...] либо {"data": [...]}
    items: list[str] = []
    if isinstance(data, list):
        for it in data:
            if isinstance(it, dict) and it.get("name"):
                items.append(str(it["name"]).strip())
            elif isinstance(it, str):
                items.append(it.strip())
    elif isinstance(data, dict):
        for it in (data.get("data", []) or []):
            if isinstance(it, dict) and it.get("name"):
                items.append(str(it["name"]).strip())
            elif isinstance(it, str):
                items.append(it.strip())

    phrase_lower = phrase_norm.lower()
    matching = [s for s in items if phrase_lower in s.lower()]
    present = len(matching) > 0

    return SuggestResult(
        phrase=phrase,
        marketplace="wb",
        present=present,
        suggestions=matching[:10],  # сохраняем до 10 для отладки
    )


def check_ozon_suggest(phrase: str) -> SuggestResult:
    """OZON поисковые подсказки.

    Эндпоинт: api.ozon.ru/composer-api.bx/_action/searchSuggestions
    Публичный, без авторизации, POST с JSON-body.
    """
    phrase_norm = phrase.strip()
    if not phrase_norm:
        return SuggestResult(phrase=phrase, marketplace="ozon", present=False)

    try:
        resp = requests.post(
            "https://api.ozon.ru/composer-api.bx/_action/searchSuggestions",
            json={"text": phrase_norm},
            headers={
                "User-Agent": _USER_AGENT,
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Origin": "https://www.ozon.ru",
                "Referer": "https://www.ozon.ru/",
            },
            proxies=_proxies(),
            timeout=_REQUEST_TIMEOUT_SEC,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.warning("ozon suggest failed for %r: %s", phrase, e)
        return SuggestResult(phrase=phrase, marketplace="ozon", present=False)

    # OZON формат может быть: {"items": [{"title": "..."}, ...]}
    # или {"suggestions": [...]} — разбираем оба
    items_raw: list = []
    if isinstance(data, dict):
        items_raw = data.get("items", []) or data.get("suggestions", []) or []

    items: list[str] = []
    for it in items_raw:
        if isinstance(it, dict):
            text = it.get("title") or it.get("text") or it.get("name") or ""
            if text:
                items.append(str(text).strip())
        elif isinstance(it, str):
            items.append(it.strip())

    phrase_lower = phrase_norm.lower()
    matching = [s for s in items if phrase_lower in s.lower()]
    present = len(matching) > 0

    return SuggestResult(
        phrase=phrase,
        marketplace="ozon",
        present=present,
        suggestions=matching[:10],
    )


def check_suggest_cached(phrase: str, *, ttl_hours: int = 24) -> tuple[bool, bool]:
    """Проверяет оба маркетплейса с использованием radar_cache.

    Возвращает (present_in_wb, present_in_ozon).

    Кэш — 1 день, т.к. появление/исчезновение товара в WB/OZON это
    оперативная информация.
    """
    cache_key = f"suggest:{phrase.lower().strip()}"
    sb = get_supabase()

    # Проверяем кэш
    try:
        res = sb.table("radar_cache").select("*").eq("cache_key", cache_key).maybe_single().execute()
        row = res.data
        if row:
            expires_at = row.get("expires_at")
            if expires_at and datetime.fromisoformat(expires_at.replace("Z", "+00:00")) >= datetime.now(timezone.utc):
                payload = row.get("payload", {}) or {}
                return (
                    bool(payload.get("present_in_wb", False)),
                    bool(payload.get("present_in_ozon", False)),
                )
    except Exception as e:
        logger.warning("suggest cache lookup failed for %r: %s", phrase, e)

    # Cache miss — запрашиваем оба маркетплейса
    wb = check_wb_suggest(phrase)
    ozon = check_ozon_suggest(phrase)

    # Пишем в кэш
    try:
        expires = datetime.now(timezone.utc) + timedelta(hours=ttl_hours)
        sb.table("radar_cache").upsert({
            "cache_key": cache_key,
            "provider": "suggest",
            "payload": {
                "phrase": phrase,
                "present_in_wb": wb.present,
                "present_in_ozon": ozon.present,
                "wb_suggestions": wb.suggestions[:5],
                "ozon_suggestions": ozon.suggestions[:5],
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            },
            "expires_at": expires.isoformat(),
        }, on_conflict="cache_key").execute()
    except Exception as e:
        logger.warning("suggest cache write failed for %r: %s", phrase, e)

    return (wb.present, ozon.present)
