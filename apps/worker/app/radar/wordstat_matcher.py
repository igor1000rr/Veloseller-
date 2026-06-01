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


def match_wordstat_to_price(
    brand_name: str,
    wordstat_phrases: list[dict],
    price_rows: list[dict],
    *,
    min_frequency: int = DEFAULT_MIN_FREQUENCY,
) -> list[MatchedQuery]:
    """Сопоставляет Wordstat фразы с прайсом и определяет статус.

    Args:
        brand_name: имя бренда ("Dyson")
        wordstat_phrases: [{phrase, frequency}, ...] из Wordstat выборки
        price_rows: строки прайса
        min_frequency: минимальная частота в Wordstat чтобы учитывать

    Returns:
        Список MatchedQuery — только фразы прошедшие brand+model фильтр.
    """
    if not wordstat_phrases:
        return []

    # Собираем все названия из прайса в нижнем регистре одной строкой
    price_text_parts: list[str] = []
    for row in price_rows:
        for v in row.values():
            if v is not None:
                price_text_parts.append(str(v).lower())
    price_blob = " ".join(price_text_parts)

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

        # Сопоставляем model с прайсом через word boundary regex.
        # Это нужно чтобы model="v11" не матчила "v110" в названии товара.
        pattern = re.compile(r"\b" + re.escape(model) + r"\b", re.IGNORECASE)
        is_in_price = bool(pattern.search(price_blob))

        results.append(MatchedQuery(
            phrase=phrase,
            model=model,
            frequency=freq,
            status="archived" if is_in_price else "new",
        ))

    return results
