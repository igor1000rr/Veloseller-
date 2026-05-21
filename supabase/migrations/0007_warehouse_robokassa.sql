-- Multi-warehouse (май 2026) + Robokassa invoices + sync failure tracking.
--
-- Эта миграция синхронизирует git-схему с фактическим состоянием прода:
--   - ранее эти изменения применялись вручную через Supabase SQL Editor
--   - код в apps/web и apps/worker рассчитывает на их наличие
--   - все ALTER и CREATE идемпотентны (IF NOT EXISTS), можно безопасно перезапускать

-- ============================================================================
-- data_connections: тип склада + failure tracking
-- ============================================================================
alter table data_connections add column if not exists warehouse_kind text;
alter table data_connections add column if not exists failure_count integer not null default 0;
alter table data_connections add column if not exists error_notified_at timestamptz;

-- ============================================================================
-- sellers: лимит складов + Robokassa subscription + Stripe payment tracking
-- ============================================================================
alter table sellers add column if not exists plan_warehouses_limit integer not null default 15;
alter table sellers add column if not exists subscription_expires_at timestamptz;
alter table sellers add column if not exists payment_failure_count integer not null default 0;
alter table sellers add column if not exists last_payment_failed_at timestamptz;
alter table sellers add column if not exists last_payment_failed_reason text;
alter table sellers add column if not exists last_payment_succeeded_at timestamptz;

-- ============================================================================
-- products: UNIQUE (seller_id, connection_id, sku) — для multi-warehouse upsert
-- ============================================================================
-- Если constraint уже есть (что вероятно, иначе код upsert падал бы) — пропускаем.
-- Если нет — логируем warning. Добавить вручную после проверки данных:
--   alter table products add constraint products_seller_connection_sku_key
--     unique (seller_id, connection_id, sku);
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_seller_connection_sku_key'
  ) then
    raise notice 'WARNING: constraint products_seller_connection_sku_key не найден. Добавьте вручную если upsert падает.';
  end if;
end $$;

-- ============================================================================
-- Robokassa invoices (российская платёжная система, альтернатива Stripe)
-- ============================================================================
create table if not exists robokassa_invoices (
  id uuid primary key default gen_random_uuid(),
  inv_id bigserial unique not null,
  seller_id uuid not null references sellers(id) on delete cascade,
  plan text not null check (plan in ('starter', 'growth', 'pro')),
  amount numeric(10, 2) not null,
  currency text not null default 'RUB',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled')),
  is_test boolean not null default false,
  paid_at timestamptz,
  result_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_robokassa_invoices_seller on robokassa_invoices(seller_id);
create index if not exists idx_robokassa_invoices_status_pending on robokassa_invoices(status) where status = 'pending';
create index if not exists idx_robokassa_invoices_created on robokassa_invoices(created_at desc);

-- RLS: селлер видит только свои инвойсы
alter table robokassa_invoices enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'robokassa_invoices'
      and policyname = 'robokassa_invoices_seller_read'
  ) then
    create policy "robokassa_invoices_seller_read" on robokassa_invoices
      for select using (auth.uid() = seller_id);
  end if;
end $$;

-- ============================================================================
-- ANALYZE — обновить статистику планировщика запросов
-- ============================================================================
analyze data_connections;
analyze sellers;
analyze products;
analyze robokassa_invoices;
