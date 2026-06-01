"""Матчер Wordstat фраз с прайсом селлера.

Идея Александра 29.05.2026:
  У ранних моделей структура brand + model. Из Wordstat фраз
  с freq>60 выделяем формализованные названия (brand + model_pattern),
  сравниваем model с тем что есть в названиях прайса:
    - есть совпадение → archived (селлер уже продаёт)
    - нет → new (это новинка которую не продаёт)
Фильтр «brand + model» отбрасывает общие запросы типа "dyson пылесос" (всё в
архив) и оставляет только "dyson v15", "bosch gbh2-26" и подобные где
явно виден модельный номер.

Архитектура (29.05.2026):
  - При upload'е прайса worker извлекает все модельные токены и сохраняет
    в radar_price_models (одна таблица на селлера)
  - В poll_brand берём этот set один раз и передаём в match_against_model_set
  - Дёшево — не нужно каждый раз читать прайс из БД или из файла
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

# Паттерн «model» — минимум одна буква И одна цифра.
# Можно дефисы/буквы/цифры в любой последовательности.
# Примеры проходят: V11, V15, GBH2-26, AD12, X-1000, MX5, RTX-4090
# Не проходят: Pro (нет цифр), 2024 (нет букв), пылесос (кириллица)
_RE_MODEL = re.compile(r"^(?=[\w\-]*[a-zA-Z])(?=[\w\-]*\d)[a-zA-Z0-9][\w\-]*$")

# Минимальная частота Wordstat чтобы фраза учитывалась.
# Александр 29.05.2026: "меньше это шум". Ниже 60 — игнор в выборке.
DEFAULT_MIN_FREQUENCY = 60


@dataclass
class MatchedQuery:
    phrase: str
    model: str
    frequency: int
    status: str  # "new" или «archived»


def extract_model_from_phrase(phrase: str, brand: str) -> Optional[str]:
    """Из фразы "brand model ..." вытягивает model. None если нет модельного паттерна.

    Примеры:
      ("dyson v15 detect absolute", "dyson") → "v15"
      ("bosch gbh2-26 dre professional", "bosch") → "gbh2-26"
      ("dyson пылесос", "dyson") → None  (нет модельного токена)
      ("просто dyson", "dyson") → None  (фраза не начинается с бренда)
    """
    if not phrase or not brand:
        return None

    phrase_lower = phrase.lower().strip()
    brand_lower = brand.lower().strip()

    if not phrase_lower.startswith(brand_lower):
        return None

    # Берём всё что после бренда
    remainder = phrase_lower[len(brand_lower):].strip()
    if not remainder:
        return None  # просто "dyson" без model — не интересно

    # Первый токен после бренда — самый вероятный кандидат. Если он не
    # проходит model_pattern — возвращаем None (это «dyson пылесос» и т.п.).
    tokens = remainder.split()
    if not tokens:
        return None
    first = tokens[0]
    if _RE_MODEL.match(first):
        return first
    return None


def match_against_model_set(
    brand_name: str,
    wordstat_phrases: list[dict],
    seller_models: set[str],
    *,
    min_frequency: int = DEFAULT_MIN_FREQUENCY,
) -> list[MatchedQuery]:
    """Сопоставляет Wordstat фразы с готовым set'ом моделей селлера.

    Используется в poll_brand (worker job) — модели берутся один раз из
    radar_price_models, не нужно перечитывать прайс.

    Args:
        brand_name: имя бренда ("Dyson")
        wordstat_phrases: [{phrase, frequency}, ...] из Wordstat
        seller_models: set нормализованных (lowercase) моделей селлера
                       из radar_price_models. Например {"v11", "v15", "gbh2-26"}
        min_frequency: минимальная частота Wordstat (≥60 по умолчанию)

    Returns:
        Список MatchedQuery — только фразы прошедшие brand+model фильтр.
        status='archived' если model в seller_models, иначе 'new'.
    """
    if not wordstat_phrases:
        return []

    results: list[MatchedQuery] = []
    for item in wordstat_phrases:
        phrase = item.get("phrase", "")
        try:
            freq = int(item.get("frequency", 0) or 0)
        except (ValueError, TypeError):
            freq = 0
        if freq < min_frequency:
            continue

        model = extract_model_from_phrase(phrase, brand_name)
        if model is None:
            continue  # фраза не brand+model — выбрасываем

        # Прямой O(1) lookup в set вместо regex по price_blob
        is_in_price = model.lower() in seller_models

        results.append(MatchedQuery(
            phrase=phrase,
            model=model,
            frequency=freq,
            status="archived" if is_in_price else "new",
        ))

    return results


def match_wordstat_to_price(
    brand_name: str,
    wordstat_phrases: list[dict],
    price_rows: list[dict],
    *,
    min_frequency: int = DEFAULT_MIN_FREQUENCY,
) -> list[MatchedQuery]:
    """Альтернативный вход — принимает сырые строки прайса (для тестов/однократного использования).

    Извлекает модели из строк один раз и делегирует match_against_model_set.
    В production коде используется match_against_model_set напрямую.
    """
    # Импорт здесь чтобы избежать круговой зависимости brand_detector ↔ wordstat_matcher
    from app.radar.brand_detector import detect_models_from_price
    seller_models = detect_models_from_price(price_rows)
    return match_against_model_set(
        brand_name, wordstat_phrases, seller_models,
        min_frequency=min_frequency,
    )
