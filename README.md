# Veloseller

Inventory intelligence для e-commerce селлеров. TVelo (скорость продаж с учётом OOS), confidence, coverage, health score, lost revenue, price elasticity.

## Стек

- `apps/web` — Next.js 15 + TypeScript + Tailwind + Supabase JS + Recharts + Stripe
- `apps/worker` — FastAPI + pandas + APScheduler + Resend + Telegram Bot API
- `supabase/migrations` — SQL для Supabase Cloud (5 миграций)

## Быстрый старт

```bash
# 1. Supabase Cloud: создать проект, в SQL Editor прогнать миграции в порядке 0001 → 0005
# 2. Скопировать .env.example → .env, заполнить ключи
# 3. Web
pnpm install
pnpm dev:web                # http://localhost:3000

# 4. Worker
cd apps/worker
python -m venv .venv && source .venv/bin/activate  # Linux/Mac
# .venv\Scripts\activate                            # Windows
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8001          # http://localhost:8001/docs

# 5. Тесты
cd apps/worker && pytest -v
```

## Деплой

- **Web** → Vercel/Coolify (Next.js auto-detect)
- **Worker** → Docker через `apps/worker/Dockerfile`, либо `docker-compose up -d` из корня
- **Stripe webhook** → `https://your-domain/api/stripe/webhook` в [Stripe Dashboard](https://dashboard.stripe.com/test/webhooks)
- **Telegram webhook** → `curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" -d "url=https://worker/telegram/webhook"`

## Возможности

- 5 источников данных: Google Sheet, Ozon, Wildberries, CSV, XML/YML feed
- TVelo, confidence, coverage, health score, segmentation
- Price tracking + elasticity (Rule 12.x)
- Lead time + safety stock калькулятор закупки
- Email digest (Resend) + Telegram digest
- Админка `/admin` (через `ADMIN_EMAILS` в env): обзор, селлеры, активность
- Биллинг Stripe (Trial → Starter → Growth → Pro) с enforcement лимитов SKU

## Конвенции

- Код — английский, комментарии/коммиты — русский
- `apps/web/lib/api.ts` — единая точка вызова worker
- Расчёты строго по `Veloseller_Dev_Spec.docx`

<!-- concurrency-test: push 2 (должен отменить push 1) -->
