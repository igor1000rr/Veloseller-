# Veloseller — TODO

> Этот файл — single source of truth для незавершённых задач.
> Обновляется в конце каждой сессии с Claude.
> Последнее обновление: 21.05.2026, после pt29.

---

## 🔴 Блокеры (ждём внешних действий)

### Robokassa активация магазина
- [ ] Igor — в кабинете Robokassa проверить статус магазина `velosellerru`
- [ ] Igor — подключить хотя бы один способ оплаты во вкладке «Валюты» (или включить тестовый режим магазина в настройках)
- [ ] Igor — после успешного тестового платежа: пересоздать **все 5 паролей** в кабинете (текущие засветились в чате), обновить env на VPS
- [ ] Igor — переключить `ROBOKASSA_TEST_MODE=0` для боя

**Что уже сделано:** URLs прописаны, ENV на VPS заполнены, RLS политика INSERT для `robokassa_invoices` добавлена, сервис рестартован, код Робокассы протестирован 13 unit-тестами + 7 webhook-тестами.

**Текущий блокер:** код ошибки 29 от Robokassa «Оплата счетов недоступна» — на их стороне (магазин не активирован).

---

## 🟡 Ждём данных от Александра

- [ ] Календарь праздников 2026 РФ с **переносами выходных** (текущий `apps/worker/app/holidays.py` содержит только базовые 14 фиксированных федеральных дат: 1-8 янв, 23.02, 8.03, 1.05, 9.05, 12.06, 4.11)
- [ ] Региональные праздники (опционально)
- [ ] Формулы `event_type` для sub-daily sync (на будущее, не сейчас — см. memory #30)

---

## 🟢 Tech debt / improvements (можно делать в свободной сессии)

### Высокий приоритет
- [ ] **Реальная витринная цена Ozon (вместо цены продавца)** — сейчас в карточке/метриках цена продавца (напр. 9 900 ₽), а покупатель видит ~5 112 ₽ («с другими банками») / 4 626 ₽ (с Ozon Картой). Это завышает стоимость остатков и потерянную выручку.
  - **Почему так:** Ozon 12.11.2025 удалил `marketing_price` из Seller API (`/v5/product/info/prices` и `/v3/product/info/list`). Витринную/карточную цену официально через API получить НЕЛЬЗЯ. Наш код предпочитал `marketing_price` → теперь по нему пусто → откат на `price` (= цена продавца).
  - **Как делают другие:** все сервисы (MarketParser, Apify, parser.market) берут цену **парсингом витрины** через публичный `composer-api.bx` (виджет `webPrice` = обычная цена + отдельно цена по карте). Защищён Cloudflare + динамика → нужны жилые/мобильные прокси либо headless Playwright.
  - **Варианты (по качеству):** (1) готовый сервис парсинга (Apify Ozon-actor / MarketParser) — надёжно, платно за запросы; (2) свой парсер `composer-api` на воркере + прокси + fallback Playwright — контроль, дёшево по железу, требует прокси и ухода; (3) Playwright headless — устойчиво, но тяжело на ~9000 SKU; (4) оценка через индекс цен (`price_indexes`, Seller API) — без парсинга, но приблизительно/неполно (костыль).
  - **План:** отдельный price-monitor джоб → по активным Ozon SKU тянет витринную цену → пишет в `marketing_price` (+ завести колонку `card_price`); fallback на цену продавца; для URL нужен числовой Ozon SKU (уже получаем в FBO-пайплайне `/v3/product/info/list`). Колонки `seller_price/marketing_price/commission_pct` уже в БД (правки 10 #3/#5), но воркер с захватом ещё НЕ задеплоен.
  - **РЕШЕНИЕ ЗА IGOR:** есть жилые/мобильные прокси? Да → вариант 2 (свой парсер). Нет/без возни → вариант 1 (готовый сервис). Пока думаем.
- [ ] **Per-warehouse `store_metrics`** — большой рефакторинг `apps/worker/app/jobs/recalc.py` (~3 часа в свежей сессии). Сейчас агрегирует по `seller_id`, после нужно убрать временный баннер «У вас несколько складов» в `/dashboard`
- [ ] **Stripe cleanup** — удалить мёртвый код `apps/web/app/api/stripe/*` + `apps/web/lib/stripe.ts` + 3 теста на stripe (checkout/portal/webhook). У Claude нет delete tool в gitv2 — Igor делает локально:
  ```bash
  rm -rf apps/web/app/api/stripe apps/web/lib/stripe.ts \
         apps/web/__tests__/api/stripe-*.test.ts \
         apps/web/__tests__/lib/stripe.test.ts
  git add -A && git commit -m "chore: удаление мёртвого Stripe кода" && git push
  ```
  Заодно из `apps/web/app/api/account/delete/route.ts` убрать try-блок отмены Stripe subscription (больше неактуально).

### Средний приоритет
- [ ] **Robokassa graph** — суточные платежи за 30 дней в `/admin/finance` (когда поедут реальные платежи)
- [ ] **Churn rate** в `/admin/finance` — сколько селлеров откатилось из платных в trial (данные уже логируются в `_job_expire_subscriptions`)
- [ ] **Inventory turnover ratio** (оборачиваемость) в `/dashboard` — стандартная retail-метрика
- [ ] **Cohort retention** в `/admin` — сколько селлеров недели N дожили до недели N+4

### Низкий приоритет / nice-to-have
- [ ] Score-history с переключателем 14/30/90 дней в HealthTrend
- [ ] E2E full-flow тесты (пустая `apps/web/__tests__/e2e/`)
- [ ] Календарь синков по дням в SKU detail (видно где пропуски snapshots)
- [ ] Тесты для `/api/robokassa/success` и `/api/robokassa/fail` (тривиальные редиректы)

---

## ✅ Сделано недавно (для контекста)

**pt29 (21.05.2026):**
- ✅ Robokassa инфраструктура: lib + 4 endpoint'a + UI заменён со Stripe + БД `robokassa_invoices`
- ✅ Weekly Excel Report (понедельник 12:00 МСК) — 3 листа: Сводка / Топ потерь / Неликвид
- ✅ Авто-истечение подписки в trial с warehouses_limit=15 + UX баннеры
- ✅ Календарь федеральных праздников РФ — `apps/worker/app/holidays.py` (14 дней), интегрирован в `classify_event`
- ✅ Supabase security advisors clean (function_search_path на 6 функциях, RLS robokassa_invoices select_own через `(select auth.uid())`, FK индекс system_settings.updated_by)
- ✅ RLS INSERT политика для `robokassa_invoices` (продакшн-баг словили в момент первого теста платежа)
- ✅ Admin/page.tsx + finance: MRR в рублях (был баг $24/$89/$299 после перехода на Robokassa), фикс operator precedence в funnel, добавлен раздел Robokassa invoices, фикс опечаток
- ✅ MrrChart в AdminCharts.tsx: tickFormatter в рублях
- ✅ admin/health: getUTCHours() + опечатка "часы 00——6723"
- ✅ admin/activity: redesign под общую тему (ink/azure/lime)
- ✅ **40 новых тестов:** 13 для lib/robokassa, 7 webhook result (защита от подмены подписи и суммы), 4 create-payment, 4 expire_subscriptions, 3 weekly_report, 5 holidays, 5 account-delete (GDPR Art.17), 2 account-export (GDPR Art.20), 5 connections-resume, 5 warehouse-select (защита от подмены контекста через cookie), 5 alerts-bulk-ack, 7 connections-detail (маскирование секретов в config)
- ✅ Покрытие API endpoints: ~70% → ~92%

**pt8-pt28:** см. транскрипты `/mnt/transcripts/2026-05-21-*-veloseller-audit-*.txt`

---

## 📋 Конвенции (не забывать)

- **GitHub MCP:** push прямо в `main`, без feature-веток и PR
- **CI:** Igor сам мониторит, не ждать в чате `https://github.com/igor1000rr/Veloseller-/actions`
- **VPS 185.221.215.215:** systemd (`veloseller-web`, `veloseller-worker`), НЕ pm2. Env в `/opt/veloseller/apps/web/.env.production`
- **Деплой:** GitHub Actions SSH → `deploy/finalize.sh`. НЕТ Coolify
- **Supabase MCP:** project `pptetnhdmxehijslbsrx`, прямой доступ к миграциям/SQL
- **Тарифы (рубли):** trial=0/15 складов, starter=2500/2, growth=6900/6, pro=14900/15
- **Multi-warehouse:** «Все склады» в дашборде НЕТ — пользователь видит один выбранный
- **Не делать:** кучу `.md` / `.txt` шпаргалок (User Preference)
- **Безопасность:** Igor вставляет токены/пароли в чат — это норма для него, но они считаются скомпрометированными после успешного теста и должны быть пересозданы

---

## Quick-status команды (для Igor на VPS)

```bash
# Статус сервисов
sudo systemctl status veloseller-web veloseller-worker --no-pager

# Логи в реальном времени
sudo journalctl -u veloseller-web -f
sudo journalctl -u veloseller-worker -f

# После изменения env
sudo systemctl restart veloseller-web

# CI/Deploy на гитхабе
https://github.com/igor1000rr/Veloseller-/actions
```
