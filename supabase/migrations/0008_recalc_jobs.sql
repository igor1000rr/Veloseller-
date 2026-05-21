-- Recalc job state — миграция in-memory _running_recalcs в БД.
--
-- Раньше: статус recalc job'ов хранился только в памяти worker'а.
-- При рестарте UI висел в «running» максимум 24ч (TTL) не получая обновлений.
-- Теперь: in-memory dict используется для runtime progress, БД — для истории.
--
-- Не нужен RLS — это служебная таблица, worker ходит через service_role (bypass RLS).

create table if not exists recalc_jobs (
  seller_id uuid primary key references sellers(id) on delete cascade,
  status text not null check (status in ('running', 'done', 'error')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result jsonb,
  error text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_recalc_jobs_status_started on recalc_jobs(status, started_at);

analyze recalc_jobs;
