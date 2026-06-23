"""Простой детектор брендов и моделей из прайса селлера.

29.05.2026 заменил AI-парсинг (brand_extractor.py через DeepSeek) на
частотный анализ + словарь стоп-слов. Идея Александра: AI это оверкилл
для задачи которая решается за ~150 строк регулярки.

Алгоритм для брендов (русская версия):
  1. Tokenize все названия товаров из прайса
  2. Фильтр кириллицы — для русской версии всё что не латиница это
     категории/характеристики, не бренды. Александр: "новинки вылазят
     в формате brand ad12".
  3. Стоп-словарь (~30 слов): Pro, Max, Ultra, Lite, Mini, Plus,
     Premium, Basic, software, update и т.п.
  4. Регулярки на артикулы: чистые числа, токены с цифрами
  5. Что осталось: считаем частоту повторений
  6. Кандидаты на бренд: токены с повторяемостью >= 3

Алгоритм для моделей (для wordstat_matcher):
  - Берём все токены содержащие И буквы И цифры (V11, GBH2-26, RTX4090)
  - Они и есть кандидаты на модельные номера
  - Сохраняются в radar_price_models per-seller
  - В poll_brand сопоставляем с Wordstat: model уже в прайсе → archived,
    нет → new

Английская версия — потом, отдельным набором правил.
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
    # --- расширение 09.06: латинский мусор электроники ---
    # прилагательные / маркетинг
    "professional", "classic", "compact", "smart", "wireless", "digital",
    "portable", "universal", "multi", "auto", "mobile", "waterproof",
    "rechargeable", "foldable", "adjustable", "combo", "eco", "value",
    "gift", "best", "top",
    # доп. цвета
    "pink", "purple", "orange", "brown", "beige", "yellow", "navy", "rose",
    "violet", "transparent",
    # тех-аббревиатуры / интерфейсы
    "usb", "hdmi", "lcd", "oled", "led", "wifi", "bluetooth", "rgb", "gps",
    "nfc", "otg", "smd", "tft", "ips", "ssd", "hdd", "dc", "ac", "uv",
    # материалы
    "steel", "metal", "plastic", "silicone", "carbon", "glass", "wood",
    "leather", "rubber", "alloy", "nylon",
})

# Регулярки
_RE_PURE_NUMBER = re.compile(r"^\d+(?:[.,]\d+)?$")
_RE_HAS_DIGIT = re.compile(r"\d")
# Только латиница с возможными ' и & внутри
_RE_LATIN_TOKEN = re.compile(r"^[a-zA-Z][a-zA-Z'&]*$")
# Разделение токенов по пробелам и спецсимволам (для брендов).
_RE_TOKEN_SPLIT = re.compile(r"[\s\-_,/.()\[\]{}\"'\\|;:!?]+")
# Для МОДЕЛЕЙ дефис НЕ разделитель: "GBH2-26", "RTX-4090", "X-1000" — единый
# модельный токен. Раньше detect_models рвал "GBH2-26"→"gbh2", а Wordstat-фраза
# (split по пробелам) давала "gbh2-26" → не совпадали → ложная «новинка».
_RE_MODEL_TOKEN_SPLIT = re.compile(r"[\s_,/.()\[\]{}\"'\\|;:!?]+")
# Модельный токен — должен содержать И букву И цифру.
# Примеры: V11, GBH2-26, AD12, RTX4090, X1
# Не проходят: Pro (нет цифр), 2024 (нет букв), пылесос (кириллица)
_RE_MODEL_TOKEN = re.compile(
    r"^(?=[\w\-]*[a-zA-Z])(?=[\w\-]*\d)[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9]$"
)
# Минимальная длина модели: 2 символа короткое, 3+ надёжнее
_MIN_MODEL_LEN = 3
_MAX_MODEL_LEN = 20


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
    """Бренд: латиница, без цифр, не стоп-слово, длина 2-30."""
    if not token or len(token) < 2 or len(token) > 30:
        return False
    if _RE_HAS_DIGIT.search(token):
        return False
    if not _RE_LATIN_TOKEN.match(token):
        return False
    if token.lower() in STOP_WORDS:
        return False
    return True


def _is_model_candidate_token(token: str) -> bool:
    """Модель: буквы И цифры одновременно, длина 3-20.

    Например V11, GBH2-26, AD12, RTX4090. Это и есть формализованные
    модельные номера которые мы потом сопоставляем с Wordstat фразами.
    """
    if not token or len(token) < _MIN_MODEL_LEN or len(token) > _MAX_MODEL_LEN:
        return False
    return bool(_RE_MODEL_TOKEN.match(token))


def detect_brands_from_price(
    rows: list[dict],
    *,
    min_repetitions: int = 3,
    max_brands: int = 100,
) -> DetectionResult:
    """Извлекает кандидатов на бренды из строк прайса (частотный анализ).

    Args:
        rows: список словарей-строк прайса (как возвращает parse_price_file)
        min_repetitions: минимальная частота токена для кандидатуры (3 разумно)
        max_brands: ограничение сверху

    Returns:
        DetectionResult с списком DetectedBrand отсортированным по sku_count убыв.
    """
    if not rows:
        return DetectionResult(error="Прайс пустой")

    token_count: Counter[str] = Counter()
    token_rows: dict[str, set[int]] = {}
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

        for tok in tokens:
            if _is_brand_candidate_token(tok):
                normalized = tok.lower()
                if normalized not in token_first_seen:
                    if tok.isupper() or tok.islower():
                        token_first_seen[normalized] = tok.capitalize()
                    else:
                        token_first_seen[normalized] = tok
                if normalized not in token_rows:
                    token_rows[normalized] = set()
                if row_idx not in token_rows[normalized]:
                    token_rows[normalized].add(row_idx)
                    token_count[normalized] += 1

    candidates: list[DetectedBrand] = []
    for normalized, count in token_count.items():
        if count >= min_repetitions:
            candidates.append(DetectedBrand(
                name=token_first_seen[normalized],
                name_normalized=normalized,
                sku_count=len(token_rows[normalized]),
            ))

    candidates.sort(key=lambda x: x.sku_count, reverse=True)
    return DetectionResult(
        brands=candidates[:max_brands],
        rows_total=len(rows),
        rows_analyzed=rows_analyzed,
    )


def detect_models_from_price(rows: list[dict]) -> set[str]:
    """Извлекает все модельные токены (lowercase) из прайса.

    Используется при upload'е чтобы заполнить radar_price_models —
    потом poll_brand сопоставляет Wordstat-фразы с этим набором.

    Возвращает множество нормализованных (lowercase) моделей.
    Дубли естественно дедуплицируются через set.

    Примеры что попадёт в результат: {"v11", "v15", "gbh2-26", "rtx4090"}.
    """
    if not rows:
        return set()

    models: set[str] = set()
    for row in rows:
        row_text_parts: list[str] = []
        for v in row.values():
            if v is None:
                continue
            s = str(v).strip()
            if s and not _RE_PURE_NUMBER.match(s):
                row_text_parts.append(s)
        if not row_text_parts:
            continue

        joined = " ".join(row_text_parts)
        tokens = _RE_MODEL_TOKEN_SPLIT.split(joined)

        for tok in tokens:
            if _is_model_candidate_token(tok):
                models.add(tok.lower())

    return models
