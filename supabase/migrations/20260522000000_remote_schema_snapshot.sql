-- ============================================================================
-- Veloseller Supabase Cloud — полный snapshot схемы на 22.05.2026
-- ============================================================================
--
-- Этот файл объединяет все 23 миграции, применённые в Supabase Cloud через CLI/Dashboard
-- (project pptetnhdmxehijslbsrx). Ранее в git была версия из 9 файлов (0001-0009),
-- которые не отражали реальное состояние прода. Сейчас git и prod синхронизированы.
--
-- Порядок блоков совпадает с порядком применения в Cloud (по version DESC).
-- Для локального восстановления: supabase db reset — и этот файл применится одним
-- большим блоком.
-- ============================================================================


-- ============================================================================
-- 20260515101408_init_schema
-- ============================================================================
-- Veloseller: базовая схема
-- Source of truth: Veloseller_Dev_Spec.docx, раздел 1. ДАННЫЕ

create type source_type as enum ('google_sheet', 'marketplace_api', 'csv_upload', 'feed', 'manual');
create type event_type as enum ('first_snapshot', 'no_change', 'sales_like', 'replenishment_like', 'anomaly_like', 'recount_like', 'missing_data');
create type marketplace_kind as enum ('ozon', 'wildberries', 'amazon', 'shopify');
create type connection_status as enum ('active', 'paused', 'error', 'pending');
create type demand_pattern as enum ('stable', 'unpredictable', 'seasonal_candidate', 'insufficient_history');
create type inventory_segment as enum ('fast_movers', 'stable', 'slow_movers', 'dead_inventory_risk', 'insufficient_data');
create type alert_kind as enum ('low_stock', 'critical_stock', 'dead_inventory', 'repeated_stockout', 'underestimated_sku');

create table sellers (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  timezone text not null default 'UTC',
  plan text not null default 'trial',
  trial_ends_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_sellers_email on sellers(email);

create table data_connections (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references sellers(id) on delete cascade,
  source source_type not null,
  marketplace marketplace_kind,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  status connection_status not null default 'pending',
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_data_connections_seller on data_connections(seller_id);

create table products (
  product_id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references sellers(id) on delete cascade,
  sku text not null,
  product_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seller_id, sku)
);
create index idx_products_seller on products(seller_id);

create table inventory_snapshots (
  snapshot_id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(product_id) on delete cascade,
  stock_quantity integer not null check (stock_quantity >= 0),
  price numeric(14, 2) not null check (price >= 0),
  availability boolean not null,
  snapshot_time timestamptz not null,
  source source_type not null,
  connection_id uuid references data_connections(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_snapshots_product_time on inventory_snapshots(product_id, snapshot_time desc);
create index idx_snapshots_time on inventory_snapshots(snapshot_time desc);

create table inventory_events (
  event_id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(product_id) on delete cascade,
  previous_snapshot_id uuid references inventory_snapshots(snapshot_id) on delete set null,
  current_snapshot_id uuid not null references inventory_snapshots(snapshot_id) on delete cascade,
  event_time timestamptz not null,
  event_date date not null,
  delta_stock integer,
  event_type event_type not null,
  excluded_from_confirmed_metrics boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_events_product_time on inventory_events(product_id, event_time desc);
create index idx_events_product_date on inventory_events(product_id, event_date desc);
create index idx_events_type on inventory_events(event_type);

create table tvelo_metrics (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(product_id) on delete cascade,
  period_start date not null,
  period_end date not null,
  confirmed_velocity numeric(14, 4),
  adjusted_velocity numeric(14, 4),
  confidence_score numeric(5, 2) not null check (confidence_score between 0 and 100),
  stockout_days integer not null default 0,
  in_stock_days integer not null default 0,
  coverage_days numeric(14, 4),
  current_stock integer not null default 0,
  current_price numeric(14, 2),
  inventory_segment inventory_segment,
  sku_health_score numeric(5, 2),
  confidence_breakdown jsonb not null default '{}'::jsonb,
  underestimated_sku boolean not null default false,
  computed_at timestamptz not null default now(),
  unique (product_id, period_start, period_end)
);
create index idx_tvelo_product on tvelo_metrics(product_id);
create index idx_tvelo_period on tvelo_metrics(period_start, period_end);

create table store_metrics (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references sellers(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  total_sku_count integer not null default 0,
  oos_sku_count integer not null default 0,
  low_stock_sku_count integer not null default 0,
  dead_inventory_sku_count integer not null default 0,
  inventory_concentration_50 integer,
  demand_concentration_50 integer,
  total_inventory_value numeric(14, 2) not null default 0,
  store_frozen_inventory_value numeric(14, 2) not null default 0,
  lost_revenue numeric(14, 2) not null default 0,
  warehouse_health_score numeric(5, 2),
  demand_pattern_distribution jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  unique (seller_id, period_start, period_end)
);
create index idx_store_metrics_seller on store_metrics(seller_id);

create table changelog (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(product_id) on delete cascade,
  seller_id uuid not null references sellers(id) on delete cascade,
  event_date date not null,
  event_type event_type not null,
  delta_stock integer,
  message text not null,
  confidence_impact numeric(5, 2),
  created_at timestamptz not null default now()
);
create index idx_changelog_seller_date on changelog(seller_id, event_date desc);
create index idx_changelog_product on changelog(product_id, event_date desc);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references sellers(id) on delete cascade,
  product_id uuid not null references products(product_id) on delete cascade,
  kind alert_kind not null,
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_alerts_seller on alerts(seller_id, created_at desc) where acknowledged_at is null;

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_sellers_updated_at before update on sellers for each row execute function set_updated_at();
create trigger trg_products_updated_at before update on products for each row execute function set_updated_at();
create trigger trg_data_connections_updated_at before update on data_connections for each row execute function set_updated_at();


-- ============================================================================
-- 20260515101423_rls_policies
-- ============================================================================
alter table sellers enable row level security;
alter table products enable row level security;
alter table data_connections enable row level security;
alter table inventory_snapshots enable row level security;
alter table inventory_events enable row level security;
alter table tvelo_metrics enable row level security;
alter table store_metrics enable row level security;
alter table changelog enable row level security;
alter table alerts enable row level security;

create policy "sellers_self_read" on sellers for select using (auth.uid() = id);
create policy "sellers_self_update" on sellers for update using (auth.uid() = id);
create policy "sellers_self_insert" on sellers for insert with check (auth.uid() = id);
create policy "products_seller_read" on products for select using (auth.uid() = seller_id);
create policy "products_seller_write" on products for all using (auth.uid() = seller_id) with check (auth.uid() = seller_id);
create policy "data_connections_seller_all" on data_connections for all using (auth.uid() = seller_id) with check (auth.uid() = seller_id);

create policy "snapshots_seller_read" on inventory_snapshots for select using (exists (select 1 from products p where p.product_id = inventory_snapshots.product_id and p.seller_id = auth.uid()));
create policy "events_seller_read" on inventory_events for select using (exists (select 1 from products p where p.product_id = inventory_events.product_id and p.seller_id = auth.uid()));
create policy "tvelo_seller_read" on tvelo_metrics for select using (exists (select 1 from products p where p.product_id = tvelo_metrics.product_id and p.seller_id = auth.uid()));
create policy "store_metrics_seller_read" on store_metrics for select using (auth.uid() = seller_id);
create policy "changelog_seller_read" on changelog for select using (auth.uid() = seller_id);
create policy "alerts_seller_all" on alerts for all using (auth.uid() = seller_id) with check (auth.uid() = seller_id);

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into sellers (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();


-- ============================================================================
-- 20260515101432_telegram_notify_fields
-- ============================================================================
alter table sellers add column if not exists telegram_chat_id text;
alter table sellers add column if not exists notify_email boolean not null default true;
alter table sellers add column if not exists notify_telegram boolean not null default true;


-- ============================================================================
-- 20260515101448_price_elasticity_and_sku_limits
-- ============================================================================
create table if not exists price_elasticity (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(product_id) on delete cascade,
  seller_id uuid not null references sellers(id) on delete cascade,
  change_date date not null,
  previous_price numeric(14, 2) not null,
  new_price numeric(14, 2) not null,
  price_delta_pct numeric(6, 2) not null,
  velocity_before numeric(14, 4),
  velocity_after numeric(14, 4),
  price_impact_percent numeric(8, 2),
  days_before integer not null default 0,
  days_after integer not null default 0,
  computed_at timestamptz not null default now(),
  unique (product_id, change_date)
);
create index if not exists idx_elasticity_product on price_elasticity(product_id, change_date desc);
create index if not exists idx_elasticity_seller on price_elasticity(seller_id, computed_at desc);

alter table price_elasticity enable row level security;
drop policy if exists "elasticity_seller_read" on price_elasticity;
create policy "elasticity_seller_read" on price_elasticity for select using (exists (select 1 from products p where p.product_id = price_elasticity.product_id and p.seller_id = auth.uid()));

create or replace function plan_sku_limit(p text) returns integer language sql immutable as $$
  select case p when 'trial' then 50 when 'starter' then 500 when 'growth' then 4000 when 'pro' then 10000 else 50 end
$$;

create or replace function enforce_sku_limit() returns trigger language plpgsql security definer as $$
declare current_count integer; max_allowed integer; seller_plan text;
begin
  select plan into seller_plan from sellers where id = new.seller_id;
  max_allowed := plan_sku_limit(coalesce(seller_plan, 'trial'));
  select count(*) into current_count from products where seller_id = new.seller_id;
  if current_count >= max_allowed then
    raise exception 'SKU limit reached: % allows up to % SKUs (current: %).', coalesce(seller_plan, 'trial'), max_allowed, current_count using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_sku_limit on products;
create trigger trg_enforce_sku_limit before insert on products for each row execute function enforce_sku_limit();


-- ============================================================================
-- 20260515101458_stripe_billing_and_leadtime
-- ============================================================================
alter table sellers add column if not exists stripe_customer_id text;
alter table sellers add column if not exists stripe_subscription_id text;
alter table sellers add column if not exists subscription_status text;
alter table sellers add column if not exists current_period_end timestamptz;
create index if not exists idx_sellers_stripe_customer on sellers(stripe_customer_id) where stripe_customer_id is not null;

alter table products add column if not exists lead_time_days integer;
alter table products add column if not exists safety_days integer;
alter table sellers add column if not exists default_lead_time_days integer not null default 14;
alter table sellers add column if not exists default_safety_days integer not null default 7;


-- ============================================================================
-- 20260515101544_harden_security_functions
-- ============================================================================
-- Фиксим warnings Supabase security linter:
-- 1) search_path в функциях (защита от SQL-инъекций через схему)
-- 2) REVOKE EXECUTE для anon/authenticated на внутренние триггерные функции

alter function public.set_updated_at() set search_path = '';
alter function public.plan_sku_limit(text) set search_path = '';
alter function public.enforce_sku_limit() set search_path = 'public';
alter function public.handle_new_user() set search_path = 'public';

revoke execute on function public.enforce_sku_limit() from anon, authenticated, public;
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.set_updated_at() from anon, authenticated, public;


-- ============================================================================
-- 20260515101631_rls_performance_optimization
-- ============================================================================
-- (select auth.uid()) вместо auth.uid() — Postgres кеширует результат на запрос.

drop policy if exists "sellers_self_read" on sellers;
drop policy if exists "sellers_self_update" on sellers;
drop policy if exists "sellers_self_insert" on sellers;

create policy "sellers_self_read" on sellers for select using ((select auth.uid()) = id);
create policy "sellers_self_update" on sellers for update using ((select auth.uid()) = id);
create policy "sellers_self_insert" on sellers for insert with check ((select auth.uid()) = id);

drop policy if exists "products_seller_read" on products;
drop policy if exists "products_seller_write" on products;

create policy "products_seller_all" on products for all
  using ((select auth.uid()) = seller_id)
  with check ((select auth.uid()) = seller_id);

drop policy if exists "data_connections_seller_all" on data_connections;
create policy "data_connections_seller_all" on data_connections for all
  using ((select auth.uid()) = seller_id)
  with check ((select auth.uid()) = seller_id);

drop policy if exists "snapshots_seller_read" on inventory_snapshots;
create policy "snapshots_seller_read" on inventory_snapshots for select using (
  exists (select 1 from products p
          where p.product_id = inventory_snapshots.product_id
          and p.seller_id = (select auth.uid()))
);

drop policy if exists "events_seller_read" on inventory_events;
create policy "events_seller_read" on inventory_events for select using (
  exists (select 1 from products p
          where p.product_id = inventory_events.product_id
          and p.seller_id = (select auth.uid()))
);

drop policy if exists "tvelo_seller_read" on tvelo_metrics;
create policy "tvelo_seller_read" on tvelo_metrics for select using (
  exists (select 1 from products p
          where p.product_id = tvelo_metrics.product_id
          and p.seller_id = (select auth.uid()))
);

drop policy if exists "store_metrics_seller_read" on store_metrics;
create policy "store_metrics_seller_read" on store_metrics for select using ((select auth.uid()) = seller_id);

drop policy if exists "changelog_seller_read" on changelog;
create policy "changelog_seller_read" on changelog for select using ((select auth.uid()) = seller_id);

drop policy if exists "alerts_seller_all" on alerts;
create policy "alerts_seller_all" on alerts for all
  using ((select auth.uid()) = seller_id)
  with check ((select auth.uid()) = seller_id);

drop policy if exists "elasticity_seller_read" on price_elasticity;
create policy "elasticity_seller_read" on price_elasticity for select using (
  exists (select 1 from products p
          where p.product_id = price_elasticity.product_id
          and p.seller_id = (select auth.uid()))
);

create index if not exists idx_alerts_product on alerts(product_id);
create index if not exists idx_events_prev_snapshot on inventory_events(previous_snapshot_id) where previous_snapshot_id is not null;
create index if not exists idx_events_curr_snapshot on inventory_events(current_snapshot_id);
create index if not exists idx_snapshots_connection on inventory_snapshots(connection_id) where connection_id is not null;


-- ============================================================================
-- 20260515135356_add_system_settings
-- ============================================================================
create table public.system_settings (
  key text primary key,
  value jsonb not null,
  description text,
  category text default 'general',
  updated_at timestamptz default now(),
  updated_by uuid references auth.users(id)
);

alter table public.system_settings enable row level security;

create policy "system_settings read for authenticated"
  on public.system_settings for select to authenticated using (true);

create index idx_system_settings_category on public.system_settings(category);

insert into public.system_settings (key, value, description, category) values
  ('registration_mode',         '"open"'::jsonb,    'Режим регистрации: open / invite / closed',          'access'),
  ('maintenance_mode',          'false'::jsonb,     'Режим обслуживания (показывать заглушку всем)',      'access'),
  ('trial_days',                '30'::jsonb,        'Длительность триала в днях',                         'billing'),
  ('stripe_test_mode',          'true'::jsonb,      'Stripe в test-режиме',                               'billing'),
  ('max_skus_starter',          '500'::jsonb,       'Лимит SKU для Starter плана',                        'limits'),
  ('max_skus_growth',           '4000'::jsonb,      'Лимит SKU для Growth плана',                         'limits'),
  ('max_skus_pro',              '10000'::jsonb,     'Лимит SKU для Pro плана',                            'limits'),
  ('snapshot_frequency_hours',  '6'::jsonb,         'Частота снапшотов (часы)',                           'pipeline'),
  ('tvelo_min_history_days',    '7'::jsonb,         'Минимум дней истории для расчёта TVelo',             'pipeline'),
  ('default_telegram_enabled',  'true'::jsonb,      'Включать Telegram digest для новых селлеров',        'notifications'),
  ('default_email_enabled',     'true'::jsonb,      'Включать email digest для новых селлеров',           'notifications'),
  ('platform_name',             '"Veloseller"'::jsonb, 'Отображаемое название платформы',                 'branding');


-- ============================================================================
-- 20260516081059_production_indexes
-- ============================================================================
create index if not exists idx_tvelo_product_period_desc on tvelo_metrics(product_id, period_end desc);
create index if not exists idx_tvelo_period_end_desc on tvelo_metrics(period_end desc);
create index if not exists idx_data_connections_status_sync on data_connections(status, last_sync_at) where status = 'active';
create index if not exists idx_data_connections_seller_status on data_connections(seller_id, status);
create index if not exists idx_alerts_seller_kind on alerts(seller_id, kind);
create index if not exists idx_changelog_seller_event_type on changelog(seller_id, event_type);
create index if not exists idx_sellers_plan on sellers(plan);
create index if not exists idx_sellers_trial_ends on sellers(trial_ends_at) where plan = 'trial';
create index if not exists idx_snapshots_connection_time on inventory_snapshots(connection_id, snapshot_time desc) where connection_id is not null;

analyze tvelo_metrics;
analyze data_connections;
analyze alerts;
analyze changelog;
analyze sellers;
analyze inventory_snapshots;


-- ============================================================================
-- 20260519113712_alerts_dedup_unique_constraint
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS alerts_unique_unread
  ON alerts (seller_id, product_id, kind)
  WHERE acknowledged_at IS NULL;

COMMENT ON INDEX alerts_unique_unread IS
  'Партиальный UNIQUE: не больше одного активного алерта на SKU+тип. Дедупликация при recalc.';


-- ============================================================================
-- 20260519115340_sellers_currency_field
-- ============================================================================
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'RUB';
COMMENT ON COLUMN sellers.currency IS 'ISO 4217 currency code для форматирования денежных сумм. Default RUB.';


-- ============================================================================
-- 20260519200228_tvelo_metrics_median_30d_velocity
-- ============================================================================
ALTER TABLE tvelo_metrics
  ADD COLUMN IF NOT EXISTS median_30d_velocity double precision DEFAULT 0.0 NOT NULL;

COMMENT ON COLUMN tvelo_metrics.median_30d_velocity IS
  'Медиана sales-like дельт из 30-day pre-period окна. Используется для estimated_continuity (Rule 5.3) и для demand_weight в store-level аггрегатах.';


-- ============================================================================
-- 20260519220653_tvelo_metrics_median_30d_velocity_to_numeric
-- ============================================================================
ALTER TABLE tvelo_metrics
  ALTER COLUMN median_30d_velocity TYPE numeric USING median_30d_velocity::numeric;


-- ============================================================================
-- 20260520125253_add_syncing_to_connection_status_enum
-- ============================================================================
ALTER TYPE connection_status ADD VALUE IF NOT EXISTS 'syncing' BEFORE 'paused';


-- ============================================================================
-- 20260520193523_add_payment_tracking_columns
-- ============================================================================
ALTER TABLE sellers
  ADD COLUMN IF NOT EXISTS last_payment_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_payment_failed_reason text,
  ADD COLUMN IF NOT EXISTS payment_failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_payment_succeeded_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_sellers_payment_failed
  ON sellers (last_payment_failed_at)
  WHERE last_payment_failed_at IS NOT NULL;


-- ============================================================================
-- 20260520194448_add_recalc_jobs_table_and_lock_functions
-- ============================================================================
CREATE TABLE IF NOT EXISTS recalc_jobs (
  seller_id     uuid PRIMARY KEY REFERENCES sellers(id) ON DELETE CASCADE,
  status        text NOT NULL CHECK (status IN ('running', 'done', 'error')),
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  result        jsonb,
  error_text    text,
  progress      jsonb,
  worker_id     text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION trg_recalc_jobs_touch() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS recalc_jobs_touch ON recalc_jobs;
CREATE TRIGGER recalc_jobs_touch
  BEFORE UPDATE ON recalc_jobs
  FOR EACH ROW EXECUTE FUNCTION trg_recalc_jobs_touch();

CREATE INDEX IF NOT EXISTS idx_recalc_jobs_stuck
  ON recalc_jobs (started_at)
  WHERE status = 'running';

CREATE OR REPLACE FUNCTION try_acquire_recalc_lock(
  p_seller_id uuid,
  p_worker_id text DEFAULT NULL,
  p_stale_after interval DEFAULT interval '1 hour'
) RETURNS boolean AS $$
DECLARE
  v_acquired boolean := false;
BEGIN
  INSERT INTO recalc_jobs (seller_id, status, started_at, worker_id, finished_at, result, error_text, progress)
  VALUES (p_seller_id, 'running', now(), p_worker_id, NULL, NULL, NULL, NULL)
  ON CONFLICT (seller_id) DO UPDATE
    SET status = 'running',
        started_at = now(),
        finished_at = NULL,
        result = NULL,
        error_text = NULL,
        progress = NULL,
        worker_id = EXCLUDED.worker_id
    WHERE recalc_jobs.status IN ('done', 'error')
       OR recalc_jobs.started_at < now() - p_stale_after
  RETURNING true INTO v_acquired;

  RETURN COALESCE(v_acquired, false);
END;
$$ LANGUAGE plpgsql VOLATILE;

CREATE OR REPLACE FUNCTION mark_recalc_done(p_seller_id uuid, p_result jsonb) RETURNS void AS $$
BEGIN
  UPDATE recalc_jobs SET status = 'done', finished_at = now(), result = p_result WHERE seller_id = p_seller_id;
END;
$$ LANGUAGE plpgsql VOLATILE;

CREATE OR REPLACE FUNCTION mark_recalc_error(p_seller_id uuid, p_error_text text) RETURNS void AS $$
BEGIN
  UPDATE recalc_jobs SET status = 'error', finished_at = now(), error_text = LEFT(p_error_text, 500) WHERE seller_id = p_seller_id;
END;
$$ LANGUAGE plpgsql VOLATILE;

CREATE OR REPLACE FUNCTION update_recalc_progress(p_seller_id uuid, p_progress jsonb) RETURNS void AS $$
BEGIN
  UPDATE recalc_jobs SET progress = p_progress WHERE seller_id = p_seller_id AND status = 'running';
END;
$$ LANGUAGE plpgsql VOLATILE;

ALTER TABLE recalc_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY recalc_jobs_seller_read ON recalc_jobs FOR SELECT USING (seller_id = (SELECT auth.uid()));


-- ============================================================================
-- 20260521121528_products_scoped_to_connection
-- ============================================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES data_connections(id) ON DELETE CASCADE;

UPDATE products p
SET connection_id = (
  SELECT s.connection_id FROM inventory_snapshots s
  WHERE s.product_id = p.product_id AND s.connection_id IS NOT NULL
  ORDER BY s.snapshot_time DESC LIMIT 1
)
WHERE p.connection_id IS NULL;

DO $$
DECLARE orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM products WHERE connection_id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % products without connection_id', orphan_count;
  END IF;
END $$;

ALTER TABLE products ALTER COLUMN connection_id SET NOT NULL;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_seller_id_sku_key;
ALTER TABLE products ADD CONSTRAINT products_seller_connection_sku_key UNIQUE (seller_id, connection_id, sku);
CREATE INDEX IF NOT EXISTS idx_products_connection_id ON products(connection_id);


-- ============================================================================
-- 20260521121602_warehouse_kind_and_plan_limits
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE warehouse_kind AS ENUM (
    'ozon_fbo', 'ozon_fbs', 'wb_fbo', 'wb_fbs', 'google_sheet'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE data_connections ADD COLUMN IF NOT EXISTS warehouse_kind warehouse_kind;

UPDATE data_connections SET warehouse_kind = CASE
  WHEN marketplace = 'ozon'        THEN 'ozon_fbo'::warehouse_kind
  WHEN marketplace = 'wildberries' THEN 'wb_fbo'::warehouse_kind
  WHEN source = 'google_sheet'     THEN 'google_sheet'::warehouse_kind
  ELSE NULL
END
WHERE warehouse_kind IS NULL;

ALTER TABLE data_connections ALTER COLUMN warehouse_kind SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_data_connections_seller_kind ON data_connections(seller_id, warehouse_kind);

ALTER TABLE sellers ADD COLUMN IF NOT EXISTS plan_warehouses_limit INTEGER NOT NULL DEFAULT 15;

UPDATE sellers SET plan_warehouses_limit = CASE plan
  WHEN 'trial' THEN 15 WHEN 'starter' THEN 2 WHEN 'growth' THEN 6 WHEN 'pro' THEN 15 ELSE 15
END;

CREATE OR REPLACE FUNCTION update_warehouses_limit_on_plan_change() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.plan IS DISTINCT FROM OLD.plan THEN
    NEW.plan_warehouses_limit := CASE NEW.plan
      WHEN 'trial' THEN 15 WHEN 'starter' THEN 2 WHEN 'growth' THEN 6 WHEN 'pro' THEN 15 ELSE 15
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_warehouses_limit ON sellers;
CREATE TRIGGER trg_update_warehouses_limit
  BEFORE UPDATE ON sellers FOR EACH ROW EXECUTE FUNCTION update_warehouses_limit_on_plan_change();


-- ============================================================================
-- 20260521133500_sync_failure_tracking
-- ============================================================================
ALTER TABLE data_connections ADD COLUMN IF NOT EXISTS failure_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE data_connections ADD COLUMN IF NOT EXISTS error_notified_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN data_connections.failure_count IS
  'Счётчик неудачных sync подряд. Сбрасывается в 0 при успешном sync. При >=3 worker ставит status=paused.';
COMMENT ON COLUMN data_connections.error_notified_at IS
  'Когда последний раз отправили email/telegram про ошибку этого склада. Для дедупликации.';


-- ============================================================================
-- 20260521145009_robokassa_invoices
-- ============================================================================
CREATE TABLE IF NOT EXISTS robokassa_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inv_id BIGSERIAL UNIQUE NOT NULL,
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('starter', 'growth', 'pro')),
  amount NUMERIC(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RUB',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'expired')),
  result_payload JSONB,
  is_test BOOLEAN NOT NULL DEFAULT FALSE,
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 hour'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_robokassa_invoices_seller ON robokassa_invoices(seller_id);
CREATE INDEX IF NOT EXISTS idx_robokassa_invoices_status ON robokassa_invoices(status);

ALTER TABLE sellers ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sellers_subscription_expires
  ON sellers(subscription_expires_at)
  WHERE subscription_expires_at IS NOT NULL;

ALTER TABLE robokassa_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "robokassa_invoices_select_own" ON robokassa_invoices FOR SELECT USING (seller_id = auth.uid());


-- ============================================================================
-- 20260521174857_fix_function_search_path
-- ============================================================================
-- Security fix: SET search_path = '' всем функциям.
-- Используем pg_catalog. prefix для built-in (now(), interval).

CREATE OR REPLACE FUNCTION public.trg_recalc_jobs_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $function$
BEGIN NEW.updated_at = pg_catalog.now(); RETURN NEW; END;
$function$;

CREATE OR REPLACE FUNCTION public.try_acquire_recalc_lock(
  p_seller_id uuid, p_worker_id text DEFAULT NULL::text,
  p_stale_after interval DEFAULT '01:00:00'::interval
) RETURNS boolean LANGUAGE plpgsql SET search_path = ''
AS $function$
DECLARE v_acquired boolean := false;
BEGIN
  INSERT INTO public.recalc_jobs (seller_id, status, started_at, worker_id, finished_at, result, error_text, progress)
  VALUES (p_seller_id, 'running', pg_catalog.now(), p_worker_id, NULL, NULL, NULL, NULL)
  ON CONFLICT (seller_id) DO UPDATE
    SET status = 'running', started_at = pg_catalog.now(), finished_at = NULL,
        result = NULL, error_text = NULL, progress = NULL, worker_id = EXCLUDED.worker_id
    WHERE public.recalc_jobs.status IN ('done', 'error')
       OR public.recalc_jobs.started_at < pg_catalog.now() - p_stale_after
  RETURNING true INTO v_acquired;
  RETURN COALESCE(v_acquired, false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_recalc_done(p_seller_id uuid, p_result jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = ''
AS $function$
BEGIN
  UPDATE public.recalc_jobs SET status = 'done', finished_at = pg_catalog.now(), result = p_result
  WHERE seller_id = p_seller_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_recalc_error(p_seller_id uuid, p_error_text text)
RETURNS void LANGUAGE plpgsql SET search_path = ''
AS $function$
BEGIN
  UPDATE public.recalc_jobs SET status = 'error', finished_at = pg_catalog.now(),
         error_text = pg_catalog.left(p_error_text, 500)
  WHERE seller_id = p_seller_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_recalc_progress(p_seller_id uuid, p_progress jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = ''
AS $function$
BEGIN
  UPDATE public.recalc_jobs SET progress = p_progress
  WHERE seller_id = p_seller_id AND status = 'running';
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_warehouses_limit_on_plan_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $function$
BEGIN
  IF NEW.plan IS DISTINCT FROM OLD.plan THEN
    NEW.plan_warehouses_limit := CASE NEW.plan
      WHEN 'trial' THEN 15 WHEN 'starter' THEN 2 WHEN 'growth' THEN 6 WHEN 'pro' THEN 15 ELSE 15
    END;
  END IF;
  RETURN NEW;
END;
$function$;


-- ============================================================================
-- 20260521174930_perf_rls_select_auth_and_fk_index
-- ============================================================================
DROP POLICY IF EXISTS "robokassa_invoices_select_own" ON public.robokassa_invoices;
CREATE POLICY "robokassa_invoices_select_own" ON public.robokassa_invoices
  FOR SELECT USING (seller_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS idx_system_settings_updated_by
  ON public.system_settings(updated_by);


-- ============================================================================
-- 20260521194517_robokassa_invoices_insert_policy
-- ============================================================================
CREATE POLICY "robokassa_invoices_insert_own" ON public.robokassa_invoices
  FOR INSERT WITH CHECK (seller_id = (SELECT auth.uid()));


-- ============================================================================
-- КОНЕЦ SNAPSHOT'А
-- ============================================================================
-- Новые миграции добавлять их обычным путём (supabase migration new <name>)
-- или файлом YYYYMMDDHHMMSS_<name>.sql после этого snapshot'а.
