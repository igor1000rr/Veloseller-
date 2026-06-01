"""Простой детектор брендов из прайса селлера.

29.05.2026 заменил AI-парсинг (brand_extractor.py через DeepSeek) на
частотный анализ + словарь стоп-слов. Идея Александра: AI это оверкилл
для задачи которая решается за ~100 строк регулярки.

Алгоритм (29.05.2026):
  1. Tokenize все названия товаров из прайса (split по \s, спецсимволам)
  2. Фильтр кириллицы — для российской версии всё что не латиница
     это категории/характеристики ("сухой пылесос", "молоко 3.5%"),
     не бренды. Александр: "новинки вылазят в формате brand ad12".
  3. Стоп-словарь (~30 слов): Pro, Max, Ultra, Lite, Mini, Plus,
     Premium, Basic, Standard, Set, Kit, Pack, Model, Series, Edition,
     Version, Gen, software, update
  4. Регулярки на артикулы: чистые числа, паттерны типа ABC-123
  5. Что осталось: считаем частоту повторений
  6. Кандидаты на бренд: токены с повторяемостью >= 3
Английская версия будет потом (Александр 29.05): там нельзя
будет выбрасывать латиницу, нужен будет отдельный словарь.
"""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Optional

# Стоп-слова — общеупотребительные английские маркетинговые слова
# которые часто повторяются в названиях товаров разных брендов.
# Александр 29.05.2026: "из памяти помню software, update, Pro,
# Ultra, Basic — с ними часто новые модели выходят к базовой версии".
STOP_WORDS: frozenset[str] = frozenset({
    # Уровни/версии
    "pro", "ultra", "max", "mini", "lite", "plus", "premium",
    "basic", "standard", "advanced", "elite", "deluxe", "super",
    # Размеры/обозначения
    "xl", "xxl", "xs", "small", "medium", "large",
    # Описательные
    "set", "kit", "pack", "bundle", "model", "series", "edition",
    "version", "gen", "generation", "type", "style", "new", "original",
    "black", "white", "red", "blue", "green", "silver", "gold", "gray", "grey",
    # Программные
    "software", "update", "upgrade", "firmware", "app",
    # Маркетплейс мусор (русские через фильтр кириллицы выпадут сами)
    "official", "оригинал", "товар", "артикул", "номер",
})

# Регулярки
_RE_PURE_NUMBER = re.compile(r"^\d+(?:[.,]\d+)?$")
_RE_HAS_DIGIT = re.compile(r"\d")
# Только латиница с возможными ' и & внутри
_RE_LATIN_TOKEN = re.compile(r"^[a-zA-Z][a-zA-Z'&]*$")
# Разделение токенов по пробелам и спецсимволам
_RE_TOKEN_SPLIT = re.compile(r"[\s\-_,/.()\[\]{}\"'\\|;:!?]+")


@dataclass
class DetectedBrand:
    name: str
    name_normalized: str
    sku_count: int = 0


@dataclass
class DetectionResult:
    brands: list[DetectedBrand] = field(default_factory=list)
    rows_total: int = 0
    rows_analyzed: int = 0
    error: Optional[str] = None


def _is_brand_candidate_token(token: str) -> bool:
    """Возвращает True если токен может быть брендом.

    Критерии (29.05.2026 русская версия):
    - длина 2-30 символов
    - только латиница
    - не в стоп-словаре
    - не содержит цифр (бренды редко с цифрами в названии)
    """
    if not token or len(token) < 2 or len(token) > 30:
        return False
    if _RE_HAS_DIGIT.search(token):
        return False  # модель/артикул
    if not _RE_LATIN_TOKEN.match(token):
        return False  # кириллица или мусор
    if token.lower() in STOP_WORDS:
        return False
    return True


def detect_brands_from_price(
    rows: list[dict],
    *,
    min_repetitions: int = 3,
    max_brands: int = 100,
) -> DetectionResult:
    """Извлекает кандидатов на бренды из строк прайса.

    Args:
        rows: список словарей-строк прайса (как возвращает parse_price_file).
                Берём текстовые значения из всех колонок.
        min_repetitions: минимальная частота токена чтобы стать кандидатом.
                         3 — разумный минимум (1-2 — случайность).
        max_brands: ограничение сверху на количество кандидатов.

    Returns:
        DetectionResult с списком DetectedBrand отсортированным по sku_count убыв.
    """
    if not rows:
        return DetectionResult(error="Прайс пустой")

    # Counter токенов и mapping норм → set of row_indices для подсчёта SKU
    token_count: Counter[str] = Counter()
    token_rows: dict[str, set[int]] = {}
    # Сохраняем первый встреченный вариант капитализации («Dyson» вместо «DYSON»)
    token_first_seen: dict[str, str] = {}
    rows_analyzed = 0

    for row_idx, row in enumerate(rows):
        row_text_parts: list[str] = []
        for v in row.values():
            if v is None:
                continue
            s = str(v).strip()
            if s and not _RE_PURE_NUMBER.match(s):
                row_text_parts.append(s)
        if not row_text_parts:
            continue
        rows_analyzed += 1

        joined = " ".join(row_text_parts)
        tokens = _RE_TOKEN_SPLIT.split(joined)

        # Уникальные кандидаты этой строки (одно SKU = одна «встреча» бренда)
        for tok in tokens:
            if _is_brand_candidate_token(tok):
                normalized = tok.lower()
                if normalized not in token_first_seen:
                    # Предпочитаем capitalize если пришли всё в верхнем или всё в нижнем
                    if tok.isupper() or tok.islower():
                        token_first_seen[normalized] = tok.capitalize()
                    else:
                        token_first_seen[normalized] = tok
                if normalized not in token_rows:
                    token_rows[normalized] = set()
                # Читаем раз на строку даже если бренд в строке несколько раз
                if row_idx not in token_rows[normalized]:
                    token_rows[normalized].add(row_idx)
                    token_count[normalized] += 1

    # Берём те у которых частота >= min_repetitions
    candidates: list[DetectedBrand] = []
    for normalized, count in token_count.items():
        if count >= min_repetitions:
            candidates.append(DetectedBrand(
                name=token_first_seen[normalized],
                name_normalized=normalized,
                sku_count=len(token_rows[normalized]),
            ))

    # Сортировка по sku_count убыванию (самые частые первыми)
    candidates.sort(key=lambda x: x.sku_count, reverse=True)

    return DetectionResult(
        brands=candidates[:max_brands],
        rows_total=len(rows),
        rows_analyzed=rows_analyzed,
    )
