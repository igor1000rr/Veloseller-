# Veloseller — архитектура и эксплуатация

Краткий технический справочник: как устроена система, как катится деплой, какие
инварианты держать и как их проверять. Дополняет продуктовый `README.md`,
`deploy/README.md`, `deploy/BACKUPS.md`, `deploy/HTTPS_SETUP.md`.

## 1. Обзор

Монорепо, два приложения + БД:

| Компонент | Стек | Назначение |
|---|---|---|
| `apps/web` | Next.js 15 (App Router, SSR), TypeScript | Кабинет, лендинг, API-роуты, биллинг |
| `apps/worker` | FastAPI, Python 3.12 | Синки маркетплейсов, пересчёт метрик, крон, Telegram-вебхук |
| Supabase | self-hosted Postgres + RLS | Данные, auth, RPC-функции |

Две сборки из одного кода: **RU** (`LOCALE=ru`, домен veloseller.ru, оплата
Robokassa) и **EN** (`.com`, платежи-заглушки). Различия — через `lib/features.ts`
(`SITE_URL`, `LOCALE`, флаги) и `messages/{ru,en}`.

## 2. Деплой

Push в `main` → **CI** (`.github/workflows/ci.yml`): worker `pytest` + web
(`tsc` / `lint` / `vitest` / `next build`). При зелёном CI → **deploy**
(`deploy.yml`, триггер `workflow_run` на успех CI, ветка `main`) → SSH →
`deploy/finalize.sh`:

- `npm ci` + `next build`, `pip install` worker;
- синк systemd-юнитов, рестарт воркера и веб-кластера `veloseller-web@{3001,3002,3003}`
  за nginx upstream;
- HTTP-warmup каждого инстанса.

**Hardening:** `finalize.sh` чонит только app-каталоги; `deploy/` принадлежит
`root:root` (см. `deploy/harden-permissions.sh`) — RCE под юзером `veloseller` не
переписывает `finalize.sh` и не эскалируется через sudo. Цена: обновления
`deploy/*.sh` катятся на VPS вручную (инструкция в шапке `harden-permissions.sh`).

Миграции БД применяются отдельно (через Supabase MCP / psql); файлы — в
`supabase/migrations/` для воспроизводимости при rebuild.

## 3. Воркер: внутреннее устройство

### Пулы задач (`app/task_queues.py`, `app/main.py`)
Пересчёт грузит всю историю продавца в память (Python/GIL); ручные синки уходят в
anyio-threadpool (до 40). Без потолка залп синков/пересчётов разъедает RAM (риск
OOM) и душит event-loop. Решение — `WorkerPool`: пул из N демон-потоков + очередь.

- `_recalc_pool` (`RECALC_CONCURRENCY`, дефолт 3), `_sync_pool` (`SYNC_CONCURRENCY`, дефолт 4).
- Состояние очереди инкапсулировано в инстансе (НЕ module-глобал с реассайном —
  иначе импортёр навсегда видел бы `None`, и защита тихо регрессировала бы).
- Поднимаются в `lifespan` (прод под uvicorn). В юнит-тестах lifespan не стартует →
  `pool.active()==False` → fallback в `BackgroundTasks` (поведение 1:1).
- Инвариант: одновременно работающих задач ≤ concurrency (тест
  `tests/test_task_queues.py::TestWorkerPoolUnderLoad`).

### Локи и идемпотентность
- **Recalc:** атомарный `try_acquire_recalc_lock` RPC (в проде **fail-closed** при
  сбое БД — два пересчёта одного селлера не идут параллельно). Статус — в
  `recalc_jobs` + in-memory `_running_recalcs`. Stale (>1ч) перехватывается.
- **Sync:** `_try_acquire_sync_lock` ставит `data_connections.status='syncing'`.
  После `SYNC_FAILURE_AUTO_PAUSE_THRESHOLD` (3) подряд ошибок склад → `paused`.
  Зависшие `syncing` чистит крон `_job_reset_stuck_syncing`.

### Персистентность ингеста (`app/ingest_persist.py`)
`_persist_snapshots`: upsert товаров (`bulk_upsert_products`, brand/category не
затираются NULL), дедуп снапшотов в окне `_DEDUP_WINDOW_HOURS=20` по
stock+price+marketing_price. Если источник не отдал цену — переносим последнюю
известную (не пишем фантомный 0).

### Крон (`app/jobs/scheduler.py`)
Ночной синк активных складов (последовательно), пересчёт, отчёты (email/Telegram),
месячная витрина лендинга (`landing_live_stats` → `system_settings`), мониторинг
застрявших синков. Флаги состояния — в `system_settings` (общие на реплики).

## 4. Метрики (TVelo) и инвариант паритета C3.2

Движок — `apps/worker/app/engine/`. Ключевое:
- `confirmed_velocity = consumption / in_stock_days` (consumption = Σ|sales_like|);
- `adjusted_velocity` = confirmed + медианная континьюити-поправка на excluded-дни;
- `coverage_days = current_stock / velocity`; `lost_revenue = velocity × stockout × price`.

Пишутся в `tvelo_metrics` / `store_metrics` / `warehouse_metrics` по
`(entity, period_start, period_end)` для окон 7/30/90 дней (ночью).

**C3.2 — паритет on-the-fly RPC ↔ движок.** SKU-лист за произвольный период считает
метрики на лету через SQL `get_skus_period_metrics`. RPC.velocity = confirmed-базис
(делит на тот же in_stock_days); сохранённый adjusted отличается на континьюити-
поправку, которой в RPC нет НАМЕРЕННО. Гварды:
- `apps/worker/tests/test_period_metrics_parity.py` (CI) — алгебра формул;
- `supabase/tests/get_skus_period_metrics_parity.sql` (на БД) — на реальных данных.
  Инварианты: **жёсткий** — in_stock_days/stockout_days совпадают 1:1; **мягкий** —
  velocity ≥95% (остаток = классификация событий воркера vs сырой sales_like RPC).

## 5. Безопасность

- **RLS** на всех данных селлеров. Сервисные таблицы (`radar_cache`,
  `admin_audit_log`, `system_settings`) — RLS включён, политик нет: доступ только
  service-role (он обходит RLS). `system_settings` читается/пишется лишь сервером
  (web `createSupabaseAdminClient`, worker `get_supabase`).
- **Web→Worker:** заголовок `X-Worker-Secret` (`require_worker_secret`,
  fail-closed в проде). **Telegram-вебхук:** `TELEGRAM_WEBHOOK_SECRET`; привязка
  только по подписанному токену (`verify_telegram_link_token`) — сырой UUID
  отклоняется (закрыт hijack).
- **Админ** = `ADMIN_EMAILS` + service-role-клиент (нет отдельной Postgres-роли).
- **CSP:** `middleware.ts` — строгий nonce + strict-dynamic на app-роутах, мягкий
  enforce на публичных. Секреты — только на сервере, в репозиторий не коммитятся.
- **Sentry:** `SENTRY_DSN`; `before_send` вычищает api_key/token/email/chat_id и пр.

## 6. Тесты и проверки

| Что | Команда | Где гоняется |
|---|---|---|
| Worker | `pytest` в `apps/worker` | CI |
| Web unit/component | `npm test` (vitest) в `apps/web` | CI |
| Web типы/линт | `npx tsc --noEmit` / `npm run lint` | CI |
| Web build | `npm run build` | CI |
| E2E smoke | `E2E_BASE_URL=https://veloseller.ru npm run test:e2e` | post-deploy job (нужна сеть/хост) |
| Паритет метрик (SQL) | `psql … -f supabase/tests/get_skus_period_metrics_parity.sql` | вручную/на БД |

Текущий объём: worker ~629 тестов, web ~459.

## 7. Частые операции

- **Склад завис в `syncing`:** дождаться `_job_reset_stuck_syncing` или снять
  статус вручную; проверить `last_error` / `failure_count` в `data_connections`.
- **Склад на `paused` (3 ошибки):** исправить креды/доступ, вернуть `status='active'`.
- **Пересчёт не идёт:** глянуть `recalc_jobs` (status/error_text) и логи воркера;
  лок снимается сам через 1ч (stale) или по завершении.
- **Масштабирование под залп:** крутить `RECALC_CONCURRENCY` / `SYNC_CONCURRENCY`
  (память!), число веб-инстансов — `WEB_PORTS` в `finalize.sh` (+ nginx upstream).
- **Advisors:** периодически `get_advisors(security|performance)`. На наших
  таблицах «unused index» — это индексы под крон (0 сканов = малые таблицы, seq
  scan дешевле); дропать не нужно. FK/duplicate-предупреждения — в схемах
  `auth`/`storage` (Supabase, не трогаем).
