# Veloseller Radar

Модуль мониторинга появления новинок в ассортименте отслеживаемых брендов.

> Radar v2 (29.05.2026) — переписан по плану Александра. AI-парсинг
> заменён на частотный анализ, suggest WB/OZON убран. Получилась
> маленькая простая утилита.

## Концепция

Wordstat показывает спрос (с реальной частотой), мы сопоставляем его с
вашим прайсом по паттерну `brand + model`:

- Модель есть в прайсе → `archived` (вы уже продаёте)
- Модели нет → `new` (новинка, кандидат на закупку)

Фильтр `brand + model` отбрасывает шумные запросы типа "dyson пылесос"
(всё в архив) и оставляет только формализованные ("dyson v15", "bosch gbh2-26")
где явно виден модельный номер.

3 вкладки UI (`/dashboard/radar`):

| Статус | Что значит |
|---|---|
| `new` | Wordstat freq≥60, brand+model паттерн, model отсутствует в прайсе. Кандидат на закупку. |
| `watching` | Юзер добавил в избранное. |
| `archived` | Уже продаёте, отклонено вручную, или автоархив после 30 дней без активности. |

## Тарифы

| Тариф | ₽/мес | Брендов |
|---|---|---|
| Trial | 0 (14 дней) | 3 |
| Старт | 900 | 3 |
| Селлер | 2500 | 10 |
| Про | 5000 | 30 |
| Эксперт | 10000 | 100 |

## Архитектура

```
[Frontend Next.js]                     [Worker FastAPI Python]
  /dashboard/radar/*           ────►   /radar/extract-brands  (X-Worker-Secret)
  /api/radar/upload                       │
  Server Actions                          ▼
                                       brand_detector.py
                                       (частотный анализ + стоп-слова,
                                        повторяемость ≥ 3 раз = бренд)
                                          │
                                          ▼
                                       detect_models_from_price
                                       (буквы+цифры токены: V11, GBH2-26)
                                          │
                                          ▼
                                       radar_price_models (per-seller)
                                          │
                          ┌────────────────┐
                          │  Scheduler     │
                          ├────────────────┤
                          │ radar-poll     │  06:00 UTC ежедневно
                          │ radar-digest   │  Пн+Чт 09:00 UTC
                          └────────────────┘
                                  │
                                  ▼
                          WordstatService
                            ├─► Yandex API (api.wordstat.yandex.net)
                            └─► XMLRiver (fallback, платно)
                                  │
                                  ▼
                          wordstat_matcher.match_against_model_set
                          (фильтр brand+model + O(1) lookup в seller_models)
                                  │
                                  ▼
                          radar_queries (status: new/watching/archived)
```

## Модули

| Файл | Что делает |
|---|---|
| `brand_detector.py` | Частотный анализ прайса → бренды (повторяемость ≥3, латиница, не стоп-слова). Также `detect_models_from_price` → set модельных токенов. |
| `wordstat_matcher.py` | Фильтр Wordstat-фраз на `brand + model` паттерн + O(1) сопоставление с set'ом моделей селлера. Возвращает MatchedQuery с статусом new/archived. |
| `price_parser.py` | Парсинг XLSX/XLS/CSV → list[dict]. Используется и в api, и в matcher для тестов. |
| `api.py` | HTTP endpoint `/radar/extract-brands` для воркера. Принимает прайс, извлекает бренды (approved/excluded по лимиту тарифа) и модели → `radar_price_models`. |
| `wordstat_provider.py` | Yandex Wordstat + XMLRiver fallback с кэшем `radar_cache` (TTL 3 дня). |
| `suggest_provider.py` | DEPRECATED для русской версии Radar v2. Оставлен для возможной англоязычной версии где Wordstat не работает. |

## Алгоритм извлечения брендов (`brand_detector.py`)

1. Tokenize все названия товаров (split по пробелам и спецсимволам)
2. Фильтр кириллицы — для русской версии всё что не латиница это
   категории/характеристики, не бренды
3. Стоп-словарь (~30 слов): Pro, Max, Ultra, Lite, Mini, Plus, Premium,
   Basic, software, update, color names и т.п.
4. Регулярка отсекает токены с цифрами (модели) и чистые числа (артикулы)
5. Что осталось — считаем частоту повторений по уникальным SKU
6. Кандидаты на бренд: токены с повторяемостью ≥ 3

## Алгоритм матчинга (`wordstat_matcher.py`)

Паттерн модели: `^(?=[\w\-]*[a-zA-Z])(?=[\w\-]*\d)[a-zA-Z0-9][\w\-]*$`
— минимум одна буква И одна цифра.

Примеры:
- ✅ V11, V15, GBH2-26, AD12, RTX-4090
- ❌ Pro (нет цифр), 2024 (нет букв), пылесос (кириллица), V (слишком короткое)

Для каждой Wordstat-фразы с `freq ≥ 60`:
1. Проверяем что фраза начинается с brand_name
2. Берём первый токен после бренда
3. Если токен проходит model pattern — извлекаем как модель
4. Если модель в `radar_price_models` селлера → `archived`, иначе → `new`

## ENV переменные на VPS worker'е

Файл: `/opt/veloseller-worker/.env` (или Coolify env).

```bash
# Wordstat основной канал — Yandex API (бесплатно с заявкой в support)
# Получить: oauth.yandex.ru → создать app → ClientID → support@direct.yandex.ru
YANDEX_WORDSTAT_OAUTH_TOKEN=y0_AgAAA...

# Wordstat fallback — XMLRiver (платно ~25₽/1000 запросов)
# Получить: xmlriver.com → регистрация → депозит 1000₽ → API → Wordstat New
XMLRIVER_USER=12345
XMLRIVER_KEY=abc...
```

> AI-парсинг прайса удалён в v2. Переменные `DEEPSEEK_API_KEY` и
> `OPENROUTER_API_KEY` больше не используются и могут быть удалены из env.

## Что осталось вручную

1. **Игорь создаёт OAuth-приложение на oauth.yandex.ru** → пишет в Yandex
   Direct support с ClientID → получает `YANDEX_WORDSTAT_OAUTH_TOKEN`
2. **Игорь регистрируется на xmlriver.com** → депозит 1000₽ → кладёт
   `XMLRIVER_USER` + `XMLRIVER_KEY` в worker env (fallback на случай если
   у Yandex API проблемы или квота закончилась)
3. **Игорь рестартует worker**: `sudo systemctl restart veloseller-worker`
4. **Юзер активирует Trial** на `/billing`
5. **Загружает прайс** на `/dashboard/radar/upload` — извлекаются бренды и
   модели за один проход без AI
6. **Подключает Telegram** в настройках (если хочет дайджесты)
