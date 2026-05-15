# Veloseller

Inventory intelligence для e-commerce селлеров.

- `apps/web` — Next.js 15 + TypeScript + Tailwind + Supabase JS + Recharts + Stripe
- `apps/worker` — FastAPI + pandas + APScheduler + Resend + Telegram Bot API
- `supabase/migrations` — SQL для Supabase Cloud (5 миграций)

Быстрый старт: `pnpm install && pnpm dev:web` для веба, `cd apps/worker && pip install -e ".[dev]" && uvicorn app.main:app --reload --port 8001` для воркера.

См. также `.env.example`, `docker-compose.yml`, `.github/workflows/ci.yml`.
