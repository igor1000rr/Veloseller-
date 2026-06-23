"""Тесты ядра Radar: парсинг прайса, детект брендов/моделей, матч с Wordstat.

Аудит 23.06: подсистема app/radar/* (price_parser, brand_detector,
wordstat_matcher) — чистая бизнес-логика без сети, но без тестов. Закрываем:
это и есть «новинка/архив»-решение, на котором держится модуль Radar.
"""
from __future__ import annotations

import io

import pytest

from app.radar.price_parser import parse_price_file
from app.radar.brand_detector import (
    _is_brand_candidate_token,
    _is_model_candidate_token,
    detect_brands_from_price,
    detect_models_from_price,
)
from app.radar.wordstat_matcher import (
    extract_model_from_phrase,
    match_against_model_set,
    match_wordstat_to_price,
)


# ---------- price_parser ----------

def test_parse_csv_comma():
    data = b"name,price\nDyson V11,1000\nBosch GBH2,2000\n"
    rows = parse_price_file(data, "price.csv")
    assert len(rows) == 2
    assert rows[0]["name"] == "Dyson V11"
    assert rows[0]["price"] == "1000"


def test_parse_csv_semicolon_sniffed():
    data = b"name;price;qty\nDyson;1000;5\nBosch;2000;3\nMakita;1500;7\n"
    rows = parse_price_file(data, "p.csv")
    assert len(rows) == 3
    assert rows[0]["name"] == "Dyson"
    assert rows[0]["qty"] == "5"


def test_parse_csv_utf8_bom():
    data = "name,price\nДайсон,1000\n".encode("utf-8-sig")
    rows = parse_price_file(data, "p.csv")
    # utf-8-sig снимает BOM — заголовок без него.
    assert rows[0]["name"] == "Дайсон"


def test_parse_unsupported_ext_raises():
    with pytest.raises(RuntimeError):
        parse_price_file(b"whatever", "file.pdf")


def test_parse_xlsx_roundtrip():
    pytest.importorskip("openpyxl")
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.append(["name", "price"])
    ws.append(["Dyson V11", 1000])
    buf = io.BytesIO()
    wb.save(buf)

    rows = parse_price_file(buf.getvalue(), "p.xlsx")
    assert rows[0]["name"] == "Dyson V11"
    assert rows[0]["price"] == 1000


# ---------- brand_detector: токен-предикаты ----------

def test_is_brand_candidate_token():
    assert _is_brand_candidate_token("Dyson")
    assert _is_brand_candidate_token("Bosch")
    assert not _is_brand_candidate_token("V11")      # есть цифра
    assert not _is_brand_candidate_token("Пылесос")  # кириллица
    assert not _is_brand_candidate_token("pro")      # стоп-слово
    assert not _is_brand_candidate_token("x")        # короче 2
    assert not _is_brand_candidate_token("")


def test_is_model_candidate_token():
    assert _is_model_candidate_token("V11")
    assert _is_model_candidate_token("RTX4090")
    assert _is_model_candidate_token("AD12")
    assert not _is_model_candidate_token("Pro")    # нет цифры
    assert not _is_model_candidate_token("2024")   # нет буквы
    assert not _is_model_candidate_token("X1")     # длина 2 < 3


# ---------- brand_detector: извлечение ----------

def test_detect_brands_frequency_and_normalization():
    rows = [
        {"n": "DYSON V11 vacuum"},
        {"n": "dyson V15 detect"},
        {"n": "Dyson Big Ball"},
        {"n": "Bosch GBH2 drill"},
        {"n": "Пылесос мощный"},
    ]
    res = detect_brands_from_price(rows, min_repetitions=3)
    names = [b.name for b in res.brands]
    assert "Dyson" in names          # 3 строки + нормализация регистра
    assert "Bosch" not in names      # 1 строка < порога
    dyson = next(b for b in res.brands if b.name == "Dyson")
    assert dyson.sku_count == 3
    assert res.rows_analyzed == 5
    assert res.error is None


def test_detect_brands_empty():
    res = detect_brands_from_price([])
    assert res.error == "Прайс пустой"
    assert res.brands == []


def test_detect_models():
    rows = [
        {"n": "Dyson V11"},
        {"n": "Dyson V15 Detect"},
        {"n": "Bosch GBH2-26"},
        {"n": "Пылесос"},
    ]
    models = detect_models_from_price(rows)
    assert "v11" in models
    assert "v15" in models
    # NB: TOKEN_SPLIT включает '-', поэтому "GBH2-26" рвётся на "gbh2"+"26".
    assert "gbh2" in models
    assert "26" not in models        # чистое число — не модель


# ---------- wordstat_matcher ----------

def test_extract_model_from_phrase():
    assert extract_model_from_phrase("dyson v15 detect absolute", "dyson") == "v15"
    # whitespace-split сохраняет дефис в модели (в отличие от detect_models)
    assert extract_model_from_phrase("bosch gbh2-26 dre", "bosch") == "gbh2-26"
    assert extract_model_from_phrase("dyson пылесос", "dyson") is None
    assert extract_model_from_phrase("просто dyson", "dyson") is None
    assert extract_model_from_phrase("dyson", "dyson") is None  # нет остатка
    assert extract_model_from_phrase("", "dyson") is None


def test_match_against_model_set_new_vs_archived():
    phrases = [
        {"phrase": "dyson v15 detect", "frequency": 500},   # нет в прайсе → new
        {"phrase": "dyson v11 fluffy", "frequency": 300},   # есть в прайсе → archived
        {"phrase": "dyson пылесос", "frequency": 1000},     # не brand+model → выброс
        {"phrase": "dyson v20 nano", "frequency": 10},      # ниже min_frequency → выброс
    ]
    res = match_against_model_set("dyson", phrases, {"v11"}, min_frequency=60)
    by_model = {m.model: m for m in res}
    assert len(res) == 2
    assert by_model["v15"].status == "new"
    assert by_model["v11"].status == "archived"
    assert "v20" not in by_model


def test_match_against_model_set_bad_frequency():
    phrases = [{"phrase": "dyson v15", "frequency": "oops"}]
    res = match_against_model_set("dyson", phrases, set(), min_frequency=60)
    assert res == []  # нечисловая частота → 0 → ниже порога


def test_match_wordstat_to_price_integration():
    price_rows = [{"n": "Dyson V11"}, {"n": "Dyson V11 spare"}]
    phrases = [
        {"phrase": "dyson v11 fluffy", "frequency": 200},
        {"phrase": "dyson v15 detect", "frequency": 200},
    ]
    res = match_wordstat_to_price("dyson", phrases, price_rows, min_frequency=60)
    by_model = {m.model: m.status for m in res}
    assert by_model["v11"] == "archived"
    assert by_model["v15"] == "new"
