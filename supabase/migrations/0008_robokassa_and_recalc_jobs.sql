-- Veloseller: Robokassa invoices + recalc_jobs (replace in-memory _running_recalcs)
--
-- Эта миграция:
--  1. Создаёт robokassa_invoices (использовалось в коде, но не было в git)
--  2. Создаёт recalc_jobs — замена in-memory словаря _running_recalcs в worker'е,
--     чтобы статус пересчёта переживал рестарт процесса и был виден из Web UI
--     через service_role.
--
-- ============================================================================
-- robokassa_invoices
-- ============================================================================

create table if not exists robokassa_invoices (
  id uuid primary key default gen_random_uuid(),
  inv_id bigserial unique,
  seller_id uuid not null references sellers(id) on delete cascade,
  plan text not null,
  amount numeric(12, 2) not null,
  currency text not null default 'RUB',
  status text not null default 'pending',
  is_test boolean not null default false,
  paid_at timestamptz,
  result_payload jsonb,
  created_at timestamptz not null default now()
);

-- Constraints на допустимые значения
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'robokassa_invoices_plan_check') then
    alter table robokassa_invoices add constraint robokassa_invoices_plan_check
      check (plan in ('starter', 'growth', 'pro'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'robokassa_invoices_status_check') then
    alter table robokassa_invoices add constraint robokassa_invoices_status_check
      check (status in ('pending', 'paid', 'failed', 'expired'));
  end if;
end $$;

create index if not exists idx_robokassa_invoices_seller
  on robokassa_invoices(seller_id, created_at desc);
create index if not exists idx_robokassa_invoices_pending
  on robokassa_invoices(status, created_at) where status = 'pending';

alter table robokassa_invoices enable row level security;

-- Селлер видит только свои инвойсы. Worker / Result URL handler ходят через
-- service_role и bypass'ят RLS — им политика не нужна.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'robokassa_invoices' and policyname = 'robokassa_invoices_seller_read'
  ) then
    create policy "robokassa_invoices_seller_read" on robokassa_invoices
      for select using (auth.uid() = seller_id);
  end if;
end $$;

-- ============================================================================
-- recalc_jobs — заменяет in-memory _running_recalcs словарь в worker/app/main.py
-- ============================================================================
--
-- Раньше: при рестарте worker процессов вся информация о текущих пересчётах
-- терялась. UI висел на статусе "running" до 24-часового TTL. После рестарта
-- _try_acquire_sync_lock в data_connections спасал от двойного запуска, но
-- UI'у нечего было показать.
--
-- Теперь: статус хранится в БД, переживает рестарт, и UI может опросить
-- /jobs/recalc/{seller_id}/status и получить актуальное состояние.
--
-- PK на seller_id — на одного селлера может быть только один активный или
-- последний завершённый job (upsert by seller_id).
--

create table if not exists recalc_jobs (
  seller_id uuid primary key references sellers(id) on delete cascade,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result jsonb,
  error text,
  progress jsonb
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recalc_jobs_status_check') then
    alter table recalc_jobs add constraint recalc_jobs_status_check
      check (status in ('running', 'done', 'error'));
  end if;
end $$;

-- Поиск всех текущих running jobs (admin dashboard, cleanup cron)
create index if not exists idx_recalc_jobs_running
  on recalc_jobs(started_at) where status = 'running';

alter table recalc_jobs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'recalc_jobs' and policyname = 'recalc_jobs_seller_read'
  ) then
    create policy "recalc_jobs_seller_read" on recalc_jobs
      for select using (auth.uid() = seller_id);
  end if;
end $$;

analyze robokassa_invoices;
analyze recalc_jobs;
