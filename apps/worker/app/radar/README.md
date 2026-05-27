# Veloseller Radar

Модуль мониторинга появления новинок в ассортименте отслеживаемых брендов.

## Концепция

Wordstat ловит рост запроса, WB/OZON suggest подтверждает спрос на покупку.
Совпадение = новинка готовая к закупке. Wordstat без suggest = инфоповод.

4 вкладки UI (`/dashboard/radar`):

| Статус | Что значит |
|---|---|
| `early` | Wordstat есть, suggest пусто. Товара ещё нет в РФ. |
| `new` | Появилось в suggest за 7 дней. Пора заказывать. |
| `watching` | Юзер добавил в избранное. |
| `archived` | Отклонено или закуплено. |

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
                                       OpenRouter Claude Haiku 4.5
                                       (парсинг прайса)

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
                            └─► XMLRiver (fallback)
                                  │
                                  ▼
                          SuggestProvider
                            ├─► search.wb.ru/suggest
                            └─► OZON composer-api
                                  │
                                  ▼
                            radar_cache (TTL 3 дня)
                                  │
                                  ▼
                          radar_queries (status: early/new/watching/archived)
```

## ENV переменные на VPS worker'е

Файл: `/etc/veloseller-worker.env` (или Coolify env, в зависимости от деплоя).

```bash
# AI парсинг прайса (обязательно для /radar/extract-brands)
OPENROUTER_API_KEY=sk-or-v1-...
# Опционально: OPENROUTER_MODEL=anthropic/claude-haiku-4.5 (default)

# Wordstat основной канал — Yandex API (бесплатно с заявкой)
# Получить: oauth.yandex.ru → создать app → ClientID → support@direct.yandex.ru
YANDEX_WORDSTAT_OAUTH_TOKEN=y0_AgAAA...

# Wordstat fallback — XMLRiver (платно ~25₽/1000 запросов)
# Получить: xmlriver.com → регистрация → депозит 1000₽ → API → Wordstat New
XMLRIVER_USER=12345
XMLRIVER_KEY=abc...
```

## ENV переменные в Next.js (Coolify / VPS web)

```bash
# Прокси к worker'у
WORKER_URL=http://127.0.0.1:8001
WORKER_SECRET=<секрет из worker'а>

# Robokassa уже настроена для Veloseller — теперь поддерживает и Radar тарифы
# (никаких новых переменных не требуется)
```

## Что осталось вручную

1. **Игорь регистрируется на xmlriver.com** → депозит 1000₽ → кладёт `XMLRIVER_USER` + `XMLRIVER_KEY` в worker env
2. **Игорь создаёт OAuth-приложение на oauth.yandex.ru** → пишет в Yandex Direct support с ClientID → получает `YANDEX_WORDSTAT_OAUTH_TOKEN`
3. **Игорь проверяет** что `OPENROUTER_API_KEY` уже стоит на worker'е (можно расшарить ключ с Lucid Bot)
4. **Игорь рестартует worker** после установки переменных:
   ```bash
   sudo systemctl restart veloseller-worker
   ```
5. **Юзер активирует Trial** на `/billing` (кнопка "Активировать Trial бесплатно")
6. **Загружает прайс** на `/dashboard/radar/upload` — ИИ извлечёт бренды
7. **Подключает Telegram** в настройках (если хочет дайджесты)
