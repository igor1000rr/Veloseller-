<div align="center">

# 📦 Veloseller

### **Inventory Intelligence для маркетплейсов**

*Считает реальную скорость продаж, ловит дефицит до того как ты его заметишь, и показывает сколько денег спит в неликвиде.*

[![CI](https://img.shields.io/github/actions/workflow/status/igor1000rr/Veloseller-/ci.yml?branch=main&label=CI&style=for-the-badge&logo=github)](https://github.com/igor1000rr/Veloseller-/actions)
[![Deploy](https://img.shields.io/github/actions/workflow/status/igor1000rr/Veloseller-/deploy.yml?branch=main&label=Deploy&style=for-the-badge&logo=githubactions)](https://github.com/igor1000rr/Veloseller-/actions)
[![License](https://img.shields.io/badge/license-Proprietary-red?style=for-the-badge)](#)
[![Live](https://img.shields.io/badge/прод-veloseller.ru-brightgreen?style=for-the-badge&logo=vercel)](https://veloseller.ru)

[Сайт](https://veloseller.ru) · [Документация](#-возможности) · [Тарифы](#-тарифы) · [Roadmap](./TODO.md)

</div>

---

## 🎯 Зачем это нужно

Селлер видит остатки в личных кабинетах Ozon/WB, но **не видит главного**:

| 😫 Проблема | ✅ Решение Veloseller |
|---|---|
| «Не понимаю какие SKU реально продаются — а какие просто долго на складе» | **TVelo** — реальная скорость продаж штук/день |
| «Узнал что товар закончился — когда заявки уже ушли к конкурентам» | **Health Score + алерты** низкого остатка за неделю до OOS |
| «Не знаю где заморожены оборотные» | **Frozen inventory** — конкретная сумма ₽ в товаре старше 180 дней |
| «Сколько денег я потерял из-за того что товара не было?» | **Lost Revenue** — `velocity × stockout_days × avg_price` по каждому SKU |
| «Реклама подняла цену — продажи упали или нет?» | **Price Elasticity** — детектит изменения цены и считает влияние на скорость |

Это **не CRM, не аналитика выручки, не bookkeeper**. Это узкий инструмент про **запасы и спрос** — для тех кто торгует на маркетплейсах и устал гадать.

---

## 📊 Что внутри

<table>
<tr>
<td width="50%">

### 🏠 Личный кабинет
- **Главная**: 4 KPI + Health Score + замороженный неликвид + 3 концентрации + 3 скорости (P10/avg/P90)
- **4 интерактивных графика**: Health Trend, Lost Revenue, Segment Distribution, Dead Inventory
- **SKU lists**: фильтры, сортировки, VelocitySparkline на каждой строке
- **SKU detail**: детальный график 30/90 дней + ReorderPanel (calc lead time + safety stock)
- **Dynamics**: что разогналось / что просело, топ-10 по росту и падению + sparkline
- **Alerts**: список с bulk-ack, фильтры по типу
- **Settings**: email/Telegram уведомления, частота, чат-ид

</td>
<td width="50%">

### 🛠 Админка
- **Overview**: 4 BigKpi (Sellers/MRR ₽/Active/Conversion) + воронка из 4 шагов
- **Finance**: MRR/ARR/ARPU в рублях, 12-недельный график, Robokassa invoices
- **Health**: Pipeline Radial Chart + Hourly Heatmap + source breakdown
- **Activity**: snapshots vs recalcs за 30 дней
- **Sellers**: список с фильтрами по плану
- **Sync errors**: последние неудачные синки с диагностикой

</td>
</tr>
</table>

---

## 🔌 Источники данных

<div align="center">

| | Тип | Подключение | Лимит |
|---|---|---|---|
| 🟠 **Ozon FBO** | Маркетплейс | Client-Id + Api-Key | По тарифу |
| 🟠 **Ozon FBS** | Маркетплейс | Client-Id + Api-Key | По тарифу |
| 🟣 **Wildberries FBO** | Маркетплейс | API token | По тарифу |
| 🟣 **Wildberries FBS** | Маркетплейс | API token | По тарифу |
| 🟢 **Google Sheets** | Универсальный | Sheet ID + публичный доступ | По тарифу |

</div>

Источники синкаются **раз в сутки** (cron в worker'е). Каждый снимок — `(product_id, snapshot_time, stock_quantity, price, availability)`. По истории строится дельта → классификация события (`sales_like` / `replenishment_like` / `anomaly_like` / `recount_like` / `missing_data`) → метрики.

---

## 🧮 Какие метрики считает

```
TVelo (Confirmed Velocity)
  └─ продажи (sales_like) / период
     с исключением праздников РФ, аномалий, дней массовых пополнений

Adjusted Velocity
  └─ TVelo, скорректированная на stockout dampening
     (нет товара = не вмененные продажи)

Coverage Days
  └─ current_stock / adjusted_velocity
     "на сколько дней хватит при текущей скорости"

Confidence Score (0–100)
  └─ штраф за малую историю, аномалии, missing data
     "насколько можно доверять метрикам"

SKU Health Score (0–100)
  └─ композит из coverage + stockout days + velocity drop

Warehouse Health Score
  └─ агрегат по складу: % здоровых SKU, % OOS, % неликвида

Lost Revenue
  └─ Σ (adjusted_velocity × stockout_days × avg_price)
     по каждому SKU

Price Elasticity
  └─ детектит price change → сравнивает velocity до/после
     показывает price_impact_percent
```

Все формулы — в [`Veloseller_Dev_Spec.docx`](./Veloseller_Dev_Spec.docx).

---

## 🏗 Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                       veloseller.ru                          │
│                                                              │
│  ┌──────────────┐         ┌──────────────────────────────┐ │
│  │  Next.js 15  │◄────────┤  apps/web (TS, Tailwind)     │ │
│  │  React 19    │         │  /dashboard /admin /billing  │ │
│  │  SSR + RSC   │         │  Recharts графики            │ │
│  └──────┬───────┘         └──────────────┬───────────────┘ │
│         │ supabase-js                    │                  │
└─────────┼─────────────────────────────────┼─────────────────┘
          │                                 │
          ▼                                 ▼
   ┌─────────────┐                  ┌───────────────┐
   │   Supabase  │                  │   Robokassa   │
   │   Postgres  │◄──── webhook ────┤  Платежи RUB  │
   │   + RLS     │                  └───────────────┘
   │   + Auth    │
   └──────┬──────┘
          │
          │ читает/пишет snapshots, metrics, alerts
          │
   ┌──────▼─────────────────────────────────────────┐
   │           apps/worker (FastAPI + Python)        │
   │  ┌─────────────────────────────────────────┐   │
   │  │  APScheduler (sync, recalc, reports)    │   │
   │  ├─────────────────────────────────────────┤   │
   │  │  Sources: ozon, wb, google_sheet        │   │
   │  ├─────────────────────────────────────────┤   │
   │  │  Engine: pipeline, store, alerts, price │   │
   │  ├─────────────────────────────────────────┤   │
   │  │  Notifications: Resend (email),         │   │
   │  │                 Telegram Bot API        │   │
   │  └─────────────────────────────────────────┘   │
   └─────────────────────────────────────────────────┘
```

**Деплой:** GitHub Actions → SSH → `deploy/finalize.sh` на Hostland VPS (Ubuntu 24.04). Сервисы под systemd: `veloseller-web`, `veloseller-worker`.

**База:** Supabase **self-hosted** на том же VPS (`api.veloseller.ru`) — ушли с Supabase Cloud из-за egress-квот. Скрипты переезда лежат в `deploy/supabase/`.

---

## 🛠 Tech Stack

<div align="center">

### Frontend
![Next.js](https://img.shields.io/badge/Next.js_15-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Recharts](https://img.shields.io/badge/Recharts-FF6384?style=for-the-badge)

### Backend
![Python](https://img.shields.io/badge/Python_3.12-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![APScheduler](https://img.shields.io/badge/APScheduler-4B8BBE?style=for-the-badge)
![pandas](https://img.shields.io/badge/pandas-150458?style=for-the-badge&logo=pandas&logoColor=white)
![Pydantic](https://img.shields.io/badge/Pydantic-E92063?style=for-the-badge&logo=pydantic&logoColor=white)

### Infrastructure
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-336791?style=for-the-badge&logo=postgresql&logoColor=white)
![Robokassa](https://img.shields.io/badge/Robokassa-FF6600?style=for-the-badge)
![Resend](https://img.shields.io/badge/Resend-000000?style=for-the-badge)
![Telegram](https://img.shields.io/badge/Telegram_Bot-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white)

### DevOps
![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2088FF?style=for-the-badge&logo=githubactions&logoColor=white)
![systemd](https://img.shields.io/badge/systemd-FCC624?style=for-the-badge&logo=linux&logoColor=black)
![Ubuntu](https://img.shields.io/badge/Ubuntu_24.04-E95420?style=for-the-badge&logo=ubuntu&logoColor=white)

</div>

---

## 💰 Тарифы

<div align="center">

| Тариф | Цена | Складов | Подходит для |
|:---:|:---:|:---:|:---|
| 🆓 **Trial** | 0 ₽ | 15 | Знакомство, малый бизнес на старте |
| 🚀 **Старт** | 2 500 ₽/мес | 2 | Один маркетплейс, до 200 SKU |
| 📈 **Рост** | 6 900 ₽/мес | 6 | Несколько складов, до 2000 SKU |
| 💎 **Pro** | 14 900 ₽/мес | 15 | Мульти-канальные продавцы, без лимитов |

</div>

Все тарифы включают **полный функционал**: TVelo, метрики, алерты, email/telegram, экспорты, dashboards. Различие только в количестве подключаемых складов.

Платежи через **Robokassa** (СБП, банковские карты, СберPay). Подписка возобновляется вручную раз в 30 дней (без автосписаний).

---

## ⚡ Quick Start (для разработчиков)

```bash
# 1. Supabase Cloud
#    Создать проект, прогнать миграции из supabase/migrations/ в SQL Editor

# 2. Web
git clone https://github.com/igor1000rr/Veloseller-.git
cd Veloseller-
npm install
cp apps/web/.env.example apps/web/.env.local  # заполнить SUPABASE_URL, ANON_KEY etc.
npm run dev:web                                # http://localhost:3000

# 3. Worker
cd apps/worker
python3.12 -m venv .venv
source .venv/bin/activate                      # Linux/Mac
# .venv\Scripts\activate                       # Windows
pip install -e ".[dev]"
cp .env.example .env                           # заполнить SUPABASE_SERVICE_ROLE_KEY etc.
uvicorn app.main:app --reload --port 8001     # http://localhost:8001/docs

# 4. Тесты
cd apps/worker && pytest -v                    # 300+ тестов Python
cd apps/web    && npm test                     # 80+ тестов TypeScript
```

---

## 🧪 Тестирование

```
apps/web/__tests__/        ~50 тестов TypeScript (vitest)
  ├─ api/                  endpoints (auth, RLS, security)
  ├─ lib/                  crypto, rate-limit, robokassa, supabase
  └─ middleware.test.ts    auth middleware

apps/worker/tests/         ~30 файлов тестов Python (pytest)
  ├─ test_engine.py        TVelo, confidence, coverage
  ├─ test_recalc_*.py      pipeline тесты (advanced, batched, e2e)
  ├─ test_sources_*.py     OZON, WB, Google Sheet парсеры
  ├─ test_holidays.py      календарь федеральных праздников РФ
  ├─ test_recount.py       детектор пересчётов склада
  └─ test_*.py             notifications, scheduler, db helpers
```

Покрытие: **API endpoints ~92%**, **worker engine ~85%**. Каждое изменение прогоняет CI через GitHub Actions, деплой только после зелёного CI.

**Security-first тестирование:** все auth-чувствительные endpoints проверяются на 4 паттерна — auth gap (401), cross-tenant access (404/403), SQL message leak, secret leak.

---

## 🗺 Roadmap

Актуальный список задач — в [**TODO.md**](./TODO.md). Кратко:

- 🔴 Активация боевого режима Robokassa
- 🟡 Per-warehouse `store_metrics` (рефакторинг recalc.py)
- 🟢 Графики Robokassa платежей в админке, churn rate, inventory turnover ratio
- 🔵 E2E full-flow тесты, cohort retention

---

## 🤝 Конвенции для разработчиков

| | |
|---|---|
| **Язык кода** | Английский (variables, functions, classes) |
| **Язык комментариев** | Русский (комментарии, docstrings, commit messages) |
| **Git flow** | Прямой push в `main`, без feature-веток |
| **Single source of truth** | `apps/web/lib/api.ts` для всех вызовов worker'а |
| **Формулы** | Строго по `Veloseller_Dev_Spec.docx` (документ от продакта Александра) |
| **Тарифы и лимиты** | `lib/robokassa.ts::PLAN_PRICES` + `sellers.plan_warehouses_limit` |

---

## 📞 Контакты

<div align="center">

**Veloseller** · [veloseller.ru](https://veloseller.ru)

Made with 🟢 by [@igor1000rr](https://t.me/igor1000rr)

Для интеграторов и агентств: **info@proaim.ru**

</div>

---

<div align="center">
<sub>© 2026 Veloseller. Все права защищены. Документация и код предоставляются "как есть" без гарантий.</sub>
</div>
