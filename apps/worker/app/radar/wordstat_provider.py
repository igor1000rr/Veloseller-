"""Wordstat провайдеры — абстракция над источником частот.

Два конкретных провайдера:
  YandexWordstatProvider — официальное API api.wordstat.yandex.net (бесплатно).
  XMLRiverProvider — платный парсинг wordstat через xmlriver.com (~25₽/1000).

Главный класс WordstatService комбинирует их:
- Использует Yandex как основной канал (бесплатно).
- При rate-limit / ошибке / отсутствии токена — fallback на XMLRiver.
- Кэширует результат в radar_cache (TTL 3 дня) — все селлеры с одним брендом
  получают результат из одного запроса.

ENV переменные:
  YANDEX_WORDSTAT_OAUTH_TOKEN — токен от api.wordstat.yandex.net (необязательно)
  XMLRIVER_USER, XMLRIVER_KEY — данные XMLRiver (необязательно)

Если ни один не задан — Wordstat не работает, worker логирует warning и
переходит к suggest (он бесплатный и тоже даёт ценный сигнал).
"""
from __future__ import annotations

import json
import logging
import os
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

import requests

from app.db import get_supabase

logger = logging.getLogger("veloseller.radar.wordstat")


# Лимит на retry при HTTP-ошибках провайдеров
_HTTP_RETRY_MAX = 3
_HTTP_RETRY_BACKOFF_SEC = 2.0
_REQUEST_TIMEOUT_SEC = 30.0


@dataclass
class WordstatRelatedQuery:
    """Один связанный запрос из ответа Wordstat (уточнение основного брендa)."""
    text: str
    frequency: int


@dataclass
class WordstatHistoryPoint:
    """Точка истории частот: один месяц."""
    year: int
    month: int
    frequency: int


@dataclass
class WordstatResult:
    """Унифицированный результат запроса частот по бренду / фразе.

    Возвращается всеми провайдерами в одном формате — UI / worker не должны
    знать какой провайдер ответил.
    """
    phrase: str                          # исходная фраза
    base_frequency: int                  # общая частота "phrase" за месяц
    related: list[WordstatRelatedQuery]  # до 50 уточнений: "phrase X", "phrase Y"
    history: list[WordstatHistoryPoint] = field(default_factory=list)
    provider: str = ""                   # "yandex" | "xmlriver" | "cache"
    fetched_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    raw: dict[str, Any] = field(default_factory=dict)  # raw response для отладки


class WordstatProvider(ABC):
    """Абстрактный провайдер частот Wordstat."""

    name: str = "abstract"

    @abstractmethod
    def is_available(self) -> bool:
        """Можно ли использовать (ключи / токен заданы)."""
        ...

    @abstractmethod
    def fetch(self, phrase: str, *, with_history: bool = False) -> WordstatResult:
        """Получить частоту + до 50 уточнений + опционально динамику.

        Кидает исключения при ошибках, выбор стратегии (retry/fallback) делает
        вызывающий WordstatService.
        """
        ...


# ---------------------------------------------------------------------------
# Yandex Wordstat API (api.wordstat.yandex.net) — официальный, бесплатный
# ---------------------------------------------------------------------------

class YandexWordstatProvider(WordstatProvider):
    """Официальное Yandex Wordstat API (запущено в июне 2025).

    Документация: https://yandex.com/support2/wordstat/en/content/api-wordstat
    Endpoint: https://api.wordstat.yandex.net/v1/topRequests, /dynamics

    Лимиты квот выдаются индивидуально по заявке в Yandex Direct support.
    Базовый лимит — 5 запросов на каждый endpoint в неделю; расширяется по
    запросу с обоснованием.
    """
    name = "yandex"

    def __init__(self) -> None:
        self.token = os.getenv("YANDEX_WORDSTAT_OAUTH_TOKEN", "").strip()
        self.base_url = "https://api.wordstat.yandex.net/v1"

    def is_available(self) -> bool:
        return bool(self.token)

    def fetch(self, phrase: str, *, with_history: bool = False) -> WordstatResult:
        # Основной endpoint: topRequests — даёт частоту фразы + список уточнений
        top_data = self._call("/topRequests", {"phrase": phrase})

        base_freq = int(top_data.get("totalCount", 0) or 0)
        related_raw = top_data.get("topRequests", []) or []
        related = [
            WordstatRelatedQuery(
                text=str(r.get("phrase", "")).strip(),
                frequency=int(r.get("count", 0) or 0),
            )
            for r in related_raw
            if r.get("phrase")
        ]

        history: list[WordstatHistoryPoint] = []
        if with_history:
            try:
                hist_data = self._call("/dynamics", {"phrase": phrase})
                for point in (hist_data.get("graph", []) or []):
                    # ожидаемый формат: {"date": "2026-04", "count": 12345}
                    date_str = point.get("date", "")
                    parts = date_str.split("-")
                    if len(parts) >= 2:
                        history.append(WordstatHistoryPoint(
                            year=int(parts[0]),
                            month=int(parts[1]),
                            frequency=int(point.get("count", 0) or 0),
                        ))
            except Exception as e:
                # История не критична — продолжаем без неё
                logger.warning("yandex wordstat: history fetch failed for %r: %s",
                               phrase, e)

        return WordstatResult(
            phrase=phrase,
            base_frequency=base_freq,
            related=related,
            history=history,
            provider=self.name,
            raw={"top": top_data},
        )

    def _call(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.base_url}{path}"
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }
        last_err: Optional[Exception] = None
        for attempt in range(_HTTP_RETRY_MAX):
            try:
                resp = requests.post(
                    url, headers=headers, json=payload,
                    timeout=_REQUEST_TIMEOUT_SEC,
                )
                if resp.status_code == 429:
                    # Rate-limit — пытаемся ещё раз, дальше пусть кидается
                    last_err = RuntimeError(f"yandex wordstat 429 rate-limit (attempt {attempt+1})")
                    time.sleep(_HTTP_RETRY_BACKOFF_SEC * (attempt + 1))
                    continue
                if resp.status_code == 503:
                    last_err = RuntimeError(f"yandex wordstat 503 quota exceeded")
                    raise last_err
                resp.raise_for_status()
                return resp.json()
            except requests.exceptions.RequestException as e:
                last_err = e
                if attempt < _HTTP_RETRY_MAX - 1:
                    time.sleep(_HTTP_RETRY_BACKOFF_SEC * (attempt + 1))
                    continue
                raise
        if last_err:
            raise last_err
        raise RuntimeError("yandex wordstat: unknown error")


# ---------------------------------------------------------------------------
# XMLRiver — платный fallback
# ---------------------------------------------------------------------------

class XMLRiverProvider(WordstatProvider):
    """XMLRiver Wordstat API.

    Документация: https://xmlriver.com/apiwordstatnew/
    Endpoint: http://xmlriver.com/wordstat/new/json?user=N&key=KEY&query=ФРАЗА
    Базовый тариф: 25₽ за 1000 запросов.

    08.06.2026: старый эндпоинт /wordstat/json отключён XMLRiver
    (code 101 "Сбор старого вордстата больше не доступен"). Перешли на
    Wordstat New (/wordstat/new/json). Формат ответа изменился:
    {"associations": [...], "popular": [...]}, элемент —
    {"value": "<freq>", "text": "<фраза>"}. Режим выдачи (топы/динамика)
    задаётся в настройках сбора кабинета XMLRiver.
    """
    name = "xmlriver"

    def __init__(self) -> None:
        self.user = os.getenv("XMLRIVER_USER", "").strip()
        self.key = os.getenv("XMLRIVER_KEY", "").strip()
        self.base_url = "http://xmlriver.com/wordstat/new/json"

    def is_available(self) -> bool:
        return bool(self.user and self.key)

    def fetch(self, phrase: str, *, with_history: bool = False) -> WordstatResult:
        params: dict[str, Any] = {
            "user": self.user,
            "key": self.key,
            "query": phrase,
        }
        # history в Wordstat New — отдельный метод (динамика), требует
        # переключения режима сбора в кабинете. Радару нужны топы запросов
        # (ассоциации-фразы), историю здесь не запрашиваем.

        last_err: Optional[Exception] = None
        for attempt in range(_HTTP_RETRY_MAX):
            try:
                resp = requests.get(self.base_url, params=params,
                                    timeout=_REQUEST_TIMEOUT_SEC)
                resp.raise_for_status()
                data = resp.json()
                break
            except requests.exceptions.RequestException as e:
                last_err = e
                if attempt < _HTTP_RETRY_MAX - 1:
                    time.sleep(_HTTP_RETRY_BACKOFF_SEC * (attempt + 1))
                    continue
                raise
        else:
            if last_err:
                raise last_err

        # XMLRiver может вернуть прикладную ошибку с HTTP 200 в теле,
        # напр. {"code": 101, "error": "..."} — raise_for_status её не ловит.
        if isinstance(data, dict) and data.get("code") and data.get("error"):
            raise RuntimeError(
                f"xmlriver wordstat error {data.get('code')}: {data.get('error')}"
            )

        # Формат ответа Wordstat New (/wordstat/new/json):
        # {
        #   "associations": [{"isAssociations": true, "value": "586744",
        #                     "text": "мультиметр"}, ...],
        #   "popular":      [{"isAssociations": false, "value": "573252",
        #                     "text": "..."}, ...]
        # }
        # value приходит строкой; отдельного totalCount нет. Объединяем
        # associations + popular в related, дедуп по тексту.
        raw_items = (data.get("associations") or []) + (data.get("popular") or [])
        related: list[WordstatRelatedQuery] = []
        seen: set[str] = set()
        for it in raw_items:
            text = str(it.get("text", "")).strip()
            if not text:
                continue
            norm = text.lower()
            if norm in seen:
                continue
            seen.add(norm)
            try:
                freq = int(it.get("value", 0) or 0)
            except (TypeError, ValueError):
                freq = 0
            related.append(WordstatRelatedQuery(text=text, frequency=freq))

        # base_frequency — частота самой запрошенной фразы, если присутствует
        # в выдаче (у Wordstat New отдельного итогового счётчика нет).
        q_norm = phrase.strip().lower()
        base_freq = next(
            (r.frequency for r in related if r.text.lower() == q_norm), 0
        )

        return WordstatResult(
            phrase=phrase,
            base_frequency=base_freq,
            related=related,
            history=[],
            provider=self.name,
            raw={"xmlriver_new": data},
        )


# ---------------------------------------------------------------------------
# WordstatService — главная точка входа с кэшем и fallback
# ---------------------------------------------------------------------------

@dataclass
class WordstatServiceConfig:
    cache_ttl_hours: int = 72  # 3 дня — Wordstat обновляется не чаще раза в неделю
    history_cache_ttl_hours: int = 168  # неделя для истории


class WordstatService:
    """Главный фасад работы с Wordstat.

    Использование:
        service = WordstatService()
        result = service.fetch("Dyson", with_history=True)

    Workflow:
    1. Проверяет кэш в radar_cache по cache_key = "wordstat:<phrase>:<history?>"
    2. Если кэш свежий — возвращает его (provider="cache")
    3. Если кэша нет — пытается Yandex Wordstat API
    4. Если Yandex недоступен / упал / нет токена — fallback на XMLRiver
    5. Сохраняет результат в кэш на 3 дня (или 1 неделю для истории)
    """

    def __init__(self, config: Optional[WordstatServiceConfig] = None) -> None:
        self.config = config or WordstatServiceConfig()
        self.yandex = YandexWordstatProvider()
        self.xmlriver = XMLRiverProvider()

    def fetch(self, phrase: str, *, with_history: bool = False) -> Optional[WordstatResult]:
        """Получить частоты по фразе с использованием кэша и fallback.

        Возвращает None если ни один провайдер не доступен (нет ключей)
        или все упали.
        """
        phrase = phrase.strip()
        if not phrase:
            return None

        # 1. Cache lookup
        cache_key = self._cache_key(phrase, with_history)
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached

        # 2-3. Yandex first, XMLRiver fallback
        providers = [p for p in (self.yandex, self.xmlriver) if p.is_available()]
        if not providers:
            logger.warning(
                "WordstatService: ни один провайдер не настроен "
                "(нет YANDEX_WORDSTAT_OAUTH_TOKEN и нет XMLRIVER_USER/KEY)"
            )
            return None

        last_err: Optional[Exception] = None
        for provider in providers:
            try:
                result = provider.fetch(phrase, with_history=with_history)
                # 4. Cache write
                self._cache_set(cache_key, result, with_history)
                logger.info(
                    "wordstat fetched: phrase=%r provider=%s base=%d related=%d",
                    phrase, result.provider, result.base_frequency, len(result.related),
                )
                return result
            except Exception as e:
                last_err = e
                logger.warning(
                    "wordstat provider %s failed for %r: %s — пробуем следующий",
                    provider.name, phrase, e,
                )
                continue

        if last_err:
            logger.error("wordstat: все провайдеры упали для %r: %s", phrase, last_err)
        return None

    # ----- кэш -----

    def _cache_key(self, phrase: str, with_history: bool) -> str:
        suffix = ":h" if with_history else ""
        # Нормализуем чтобы "Dyson", "dyson", "DYSON" были одинаковыми кэш-ключами
        return f"wordstat:{phrase.lower().strip()}{suffix}"

    def _cache_get(self, cache_key: str) -> Optional[WordstatResult]:
        try:
            sb = get_supabase()
            res = sb.table("radar_cache").select("*").eq("cache_key", cache_key).maybe_single().execute()
            row = res.data
            if not row:
                return None
            expires_at = row.get("expires_at")
            if expires_at and datetime.fromisoformat(expires_at.replace("Z", "+00:00")) < datetime.now(timezone.utc):
                # просрочен — игнорируем, пусть пересоздаст следующий fetch
                return None
            payload = row.get("payload", {}) or {}
            return WordstatResult(
                phrase=payload.get("phrase", ""),
                base_frequency=int(payload.get("base_frequency", 0) or 0),
                related=[
                    WordstatRelatedQuery(text=r["text"], frequency=int(r["frequency"]))
                    for r in payload.get("related", [])
                ],
                history=[
                    WordstatHistoryPoint(year=h["year"], month=h["month"],
                                          frequency=int(h["frequency"]))
                    for h in payload.get("history", [])
                ],
                provider="cache",
                raw={},
            )
        except Exception as e:
            logger.warning("radar_cache get failed for %r: %s", cache_key, e)
            return None

    def _cache_set(self, cache_key: str, result: WordstatResult, with_history: bool) -> None:
        try:
            sb = get_supabase()
            ttl = self.config.history_cache_ttl_hours if with_history else self.config.cache_ttl_hours
            expires = datetime.now(timezone.utc) + timedelta(hours=ttl)
            payload = {
                "phrase": result.phrase,
                "base_frequency": result.base_frequency,
                "related": [{"text": r.text, "frequency": r.frequency} for r in result.related],
                "history": [{"year": h.year, "month": h.month, "frequency": h.frequency}
                             for h in result.history],
                "provider": result.provider,
                "fetched_at": result.fetched_at.isoformat(),
            }
            sb.table("radar_cache").upsert({
                "cache_key": cache_key,
                "provider": result.provider,
                "payload": payload,
                "expires_at": expires.isoformat(),
            }, on_conflict="cache_key").execute()
        except Exception as e:
            logger.warning("radar_cache set failed for %r: %s", cache_key, e)
