# Veloseller — TODO

> Этот файл — single source of truth для незавершённых задач.
> Обновляется в конце каждой сессии с Claude.
> Последнее обновление: 09.06.2026 (блок «Парсинг конкурентов»: витринная цена + sku/nmId-ссылки)

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
- [ ] **Будущий блок: Парсинг витрины / конкурентов** (Igor 09.06 — вынести сюда: движок получения данных общий для всего ниже).
  - **Движок (общий):** цену покупателя/конкурента Seller API не отдаёт (Ozon 12.11.2025 удалил `marketing_price`). Все берут парсингом витрины через публичный `composer-api.bx` (виджет `webPrice` = обычная цена + цена по карте); защита Cloudflare + динамика → нужны жилые/мобильные прокси либо headless Playwright. Варианты: (1) готовый сервис (Apify/MarketParser) — надёжно, платно; (2) свой парсер composer-api + прокси + fallback Playwright — контроль, нужны прокси и уход; (3) Playwright — устойчиво, тяжело на объёме; (4) индекс цен (Seller API) — приблизительно, костыль. **РЕШЕНИЕ ЗА IGOR:** прокси есть → вар. 2, нет → вар. 1. Пока думаем.
  - **1. Витринная/карточная цена наших товаров** (вместо цены продавца): в карточке/метриках цена продавца (9 900 ₽), покупатель платит ~5 112 / 4 626 (с картой) → завышены стоимость остатков и потерянная выручка. План: price-monitor джоб → витринная цена в `marketing_price` (+ завести `card_price`), fallback на цену продавца. Колонки `seller_price/marketing_price/commission_pct` уже в БД (правки 10), воркер с захватом ещё НЕ задеплоен.
  - **2. Числовой sku/nmId + ссылка «открыть на маркетплейсе»** (Igor 09.06 — подтверждено): готовой ссылки в API нет, но есть числовой Ozon `sku` (`/v3/product/info/list`) и WB `nmId`. Хранить под ОТДЕЛЬНОЙ колонкой (напр. `external_sku` + аналогично для WB), НЕ трогая `products.sku` (= offer_id, напр. SFRRNST2). Ссылки: Ozon `ozon.ru/product/<sku>`, WB `wildberries.ru/catalog/<nmId>/detail.aspx`. Кликабельно в карточке + списке. Это же — URL-основа для парсинга витрины (п. 1 и 3), пригодится для сравнения цен.
  - **3. (на будущее) Сравнение цен конкурентов** — по товарам тянуть цены конкурентов с витрины, показывать дельту. Тот же движок.
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
