-- ============================================================================
-- Veloseller Supabase Cloud — ПОЛНЫЙ snapshot реальной схемы прода на 01.06.2026
-- ============================================================================
-- project: pptetnhdmxehijslbsrx (Veloseller-)
--
-- Снято напрямую с прод-БД (information_schema / pg_catalog / pg_get_*defs).
-- Замещает прежний снапшот 20260522000000, который отражал лишь 23 из 54
-- применённых в проде миграций (radar, notification_subscriptions,
-- report_history, warehouse_metrics(_history), все RPC и пр. в git отсутствовали).
--
-- Назначение: `supabase db reset` / свежее окружение воспроизводят прод 1:1.
--
-- ОГРАНИЧЕНИЯ (осознанно вне дампа public-схемы):
--   * Storage bucket отчётов (миграция reports_storage_bucket_and_path) —
--     объект Supabase Storage, не public DDL. Создаётся отдельно.
--   * auth.* объекты не дампятся, КРОМЕ триггера on_auth_user_created (он ниже).
--   * Данные не включены, кроме сида system_settings.
--   * Контрольные суммы migration-history НЕ сверяются — для полной CLI-гигиены
--     истории используйте `supabase db pull` (он первичен для прод-workflow).
-- ============================================================================


-- ─── EXTENSIONS ─────────────────────────────────────────────────────────────
create extension if not exists "pg_stat_statements" with schema extensions;
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "supabase_vault" with schema vault;
create extension if not exists "uuid-ossp" with schema extensions;


-- ─── SEQUENCES ──────────────────────────────────────────────────────────────
create sequence if not exists public.robokassa_invoices_inv_id_seq;


-- ─── ENUM TYPES ─────────────────────────────────────────────────────────────
create type public.alert_kind as enum ('low_stock', 'critical_stock', 'dead_inventory', 'repeated_stockout', 'underestimated_sku');
create type public.connection_status as enum ('active', 'syncing', 'paused', 'error', 'pending');
create type public.demand_pattern as enum ('stable', 'unpredictable', 'seasonal_candidate', 'insufficient_history');
create type public.event_type as enum ('first_snapshot', 'no_change', 'sales_like', 'replenishment_like', 'anomaly_like', 'recount_like', 'missing_data');
create type public.inventory_segment as enum ('fast_movers', 'stable', 'slow_movers', 'dead_inventory_risk', 'insufficient_data');
create type public.marketplace_kind as enum ('ozon', 'wildberries', 'amazon', 'shopify');
create type public.notification_channel as enum ('email', 'telegram');
create type public.notification_frequency as enum ('weekly', 'monthly', 'daily');
create type public.notification_kind as enum ('low_stock', 'critical_stock', 'dead_inventory', 'repeated_stockout', 'underestimated_sku', 'sync_error', 'weekly_report', 'daily_digest');
create type public.source_type as enum ('google_sheet', 'marketplace_api', 'csv_upload', 'feed', 'manual');
create type public.warehouse_kind as enum ('ozon_fbo', 'ozon_fbs', 'wb_fbo', 'wb_fbs', 'google_sheet');


-- ─── TABLES ─────────────────────────────────────────────────────────────────
create table public.sellers (
  id uuid not null,
  email text not null,
  display_name text,
  timezone text not null default 'UTC'::text,
  plan text not null default 'trial'::text,
  trial_ends_at timestamp with time zone not null default (now() + '30 days'::interval),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  telegram_chat_id text,
  notify_email boolean not null default true,
  notify_telegram boolean not null default true,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text,
  current_period_end timestamp with time zone,
  default_lead_time_days integer not null default 14,
  default_safety_days integer not null default 7,
  currency text not null default 'RUB'::text,
  last_payment_failed_at timestamp with time zone,
  last_payment_failed_reason text,
  payment_failure_count integer not null default 0,
  last_payment_succeeded_at timestamp with time zone,
  plan_warehouses_limit integer not null default 15,
  subscription_expires_at timestamp with time zone,
  radar_plan text default 'none'::text,
  radar_brands_limit integer default 0,
  radar_active_until timestamp with time zone,
  radar_trial_started_at timestamp with time zone
);

create table public.data_connections (
  id uuid not null default gen_random_uuid(),
  seller_id uuid not null,
  source source_type not null,
  marketplace marketplace_kind,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  status connection_status not null default 'pending'::connection_status,
  last_sync_at timestamp with time zone,
  last_error text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  warehouse_kind warehouse_kind not null,
  failure_count integer not null default 0,
  error_notified_at timestamp with time zone
);

create table public.products (
  product_id uuid not null default gen_random_uuid(),
  seller_id uuid not null,
  sku text not null,
  product_name text not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  lead_time_days integer,
  safety_days integer,
  connection_id uuid not null,
  user_notes text
);

create table public.inventory_snapshots (
  snapshot_id uuid not null default gen_random_uuid(),
  product_id uuid not null,
  stock_quantity integer not null,
  price numeric(14,2) not null,
  availability boolean not null,
  snapshot_time timestamp with time zone not null,
  source source_type not null,
  connection_id uuid,
  created_at timestamp with time zone not null default now()
);

create table public.inventory_events (
  event_id uuid not null default gen_random_uuid(),
  product_id uuid not null,
  previous_snapshot_id uuid,
  current_snapshot_id uuid not null,
  event_time timestamp with time zone not null,
  event_date date not null,
  delta_stock integer,
  event_type event_type not null,
  excluded_from_confirmed_metrics boolean not null default false,
  created_at timestamp with time zone not null default now()
);

create table public.tvelo_metrics (
  id uuid not null default gen_random_uuid(),
  product_id uuid not null,
  period_start date not null,
  period_end date not null,
  confirmed_velocity numeric(14,4),
  adjusted_velocity numeric(14,4),
  confidence_score numeric(5,2) not null,
  stockout_days integer not null default 0,
  in_stock_days integer not null default 0,
  coverage_days numeric(14,4),
  current_stock integer not null default 0,
  current_price numeric(14,2),
  inventory_segment inventory_segment,
  sku_health_score numeric(5,2),
  confidence_breakdown jsonb not null default '{}'::jsonb,
  underestimated_sku boolean not null default false,
  computed_at timestamp with time zone not null default now(),
  median_30d_velocity numeric not null default 0.0
);

create table public.store_metrics (
  id uuid not null default gen_random_uuid(),
  seller_id uuid not null,
  period_start date not null,
  period_end date not null,
  total_sku_count integer not null default 0,
  oos_sku_count integer not null default 0,
  low_stock_sku_count integer not null default 0,
  dead_inventory_sku_count integer not null default 0,
  inventory_concentration_50 integer,
  demand_concentration_50 integer,
  total_inventory_value numeric(14,2) not null default 0,
  store_frozen_inventory_value numeric(14,2) not null default 0,
  lost_revenue numeric(14,2) not null default 0,
  warehouse_health_score numeric(5,2),
  demand_pattern_distribution jsonb not null default '{}'::jsonb,
  computed_at timestamp with time zone not null default now(),
  inactive_sku_count integer not null default 0,
  frequently_oos_sku_count integer not null default 0,
  potential_revenue numeric default 0
);

create table public.changelog (
  id uuid not null default gen_random_uuid(),
  product_id uuid not null,
  seller_id uuid not null,
  event_date date not null,
  event_type event_type not null,
  delta_stock integer,
  message text not null,
  confidence_impact numeric(5,2),
  created_at timestamp with time zone not null default now()
);

create table public.alerts (
  id uuid not null default gen_random_uuid(),
  seller_id uuid not null,
  product_id uuid not null,
  kind alert_kind not null,
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  acknowledged_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create table public.price_elasticity (
  id uuid not null default gen_random_uuid(),
  product_id uuid not null,
  seller_id uuid not null,
  change_date date not null,
  previous_price numeric(14,2) not null,
  new_price numeric(14,2) not null,
  price_delta_pct numeric(6,2) not null,
  velocity_before numeric(14,4),
  velocity_after numeric(14,4),
  price_impact_percent numeric(8,2),
  days_before integer not null default 0,
  days_after integer not null default 0,
  computed_at timestamp with time zone not null default now()
);

create table public.system_settings (
  key text not null,
  value jsonb not null,
  description text,
  category text default 'general'::text,
  updated_at timestamp with time zone default now(),
  updated_by uuid
);

create table public.recalc_jobs (
  seller_id uuid not null,
  status text not null,
  started_at timestamp with time zone not null default now(),
  finished_at timestamp with time zone,
  result jsonb,
  error_text text,
  progress jsonb,
  worker_id text,
  updated_at timestamp with time zone not null default now()
);

create table public.robokassa_invoices (
  id uuid not null default gen_random_uuid(),
  inv_id bigint not null default nextval('robokassa_invoices_inv_id_seq'::regclass),
  seller_id uuid not null,
  plan text not null,
  amount numeric(10,2) not null,
  currency text not null default 'RUB'::text,
  status text not null default 'pending'::text,
  result_payload jsonb,
  is_test boolean not null default false,
  paid_at timestamp with time zone,
  expires_at timestamp with time zone not null default (now() + '01:00:00'::interval),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  product_kind text default 'veloseller'::text
);

create table public.notification_subscriptions (
  id uuid not null default gen_random_uuid(),
  seller_id uuid not null,
  kind notification_kind not null,
  channel notification_channel not null,
  enabled boolean not null default true,
  params jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  frequency notification_frequency not null default 'weekly'::notification_frequency
);

create table public.report_history (
  id uuid not null default gen_random_uuid(),
  seller_id uuid not null,
  sent_at timestamp with time zone not null default now(),
  day_of_week integer not null,
  kinds text[] not null,
  channel notification_channel not null,
  status text not null default 'sent'::text,
  sku_counts jsonb not null default '{}'::jsonb,
  file_name text,
  file_size_bytes integer,
  error_message text,
  sent_date date default ((sent_at AT TIME ZONE 'UTC'::text))::date,
  storage_path text
);

create table public.warehouse_metrics (
  id uuid not null default gen_random_uuid(),
  seller_id uuid not null,
  connection_id uuid not null,
  period_start date not null,
  period_end date not null,
  total_sku_count integer default 0,
  oos_sku_count integer default 0,
  low_stock_sku_count integer default 0,
  dead_inventory_sku_count integer default 0,
  inactive_sku_count integer default 0,
  frequently_oos_sku_count integer default 0,
  inventory_concentration_50 integer default 0,
  demand_concentration_50 integer default 0,
  total_inventory_value numeric(18,2) default 0,
  store_frozen_inventory_value numeric(18,2) default 0,
  lost_revenue numeric(18,2) default 0,
  warehouse_health_score numeric(5,2),
  demand_pattern_distribution jsonb default '{}'::jsonb,
  computed_at timestamp with time zone not null default now(),
  potential_revenue numeric default 0
);

create table public.warehouse_metrics_history (
  id uuid not null default gen_random_uuid(),
  seller_id uuid not null,
  connection_id uuid not null,
  period_start date not null,
  period_end date not null,
  warehouse_health_score numeric,
  lost_revenue numeric,
  total_inventory_value numeric,
  store_frozen_inventory_value numeric,
  dead_inventory_sku_count integer,
  computed_at timestamp with time zone default now()
);

create table public.radar_brands (
  id uuid not null default gen_random_uuid(),
  seller_id uuid not null,
  name text not null,
  name_normalized text not null,
  source text not null default 'ai'::text,
  status text not null default 'approved'::text,
  last_wordstat_at timestamp with time zone,
  sku_count integer default 0,
  avg_price numeric(12,2),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.radar_queries (
  id uuid not null default gen_random_uuid(),
  seller_id uuid not null,
  brand_id uuid not null,
  query_text text not null,
  query_normalized text not null,
  current_frequency integer default 0,
  trend_pct numeric(6,2),
  present_in_wb boolean default false,
  present_in_ozon boolean default false,
  suggest_checked_at timestamp with time zone,
  status text not null default 'early'::text,
  is_favorite boolean default false,
  first_seen_at timestamp with time zone not null default now(),
  last_updated_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now()
);

create table public.radar_query_history (
  id uuid not null default gen_random_uuid(),
  query_id uuid not null,
  period_year integer not null,
  period_month integer not null,
  frequency integer not null default 0,
  captured_at timestamp with time zone not null default now()
);

create table public.radar_cache (
  id uuid not null default gen_random_uuid(),
  cache_key text not null,
  provider text not null,
  payload jsonb not null,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone not null default now()
);

create table public.radar_price_uploads (
  id uuid not null default gen_random_uuid(),
  seller_id uuid not null,
  file_name text not null,
  file_size_bytes integer not null,
  file_hash text not null,
  rows_total integer default 0,
  ai_provider text,
  ai_model text,
  ai_input_tokens integer,
  ai_output_tokens integer,
  ai_cost_usd numeric(10,6),
  ai_response jsonb,
  brands_extracted integer default 0,
  brands_approved integer default 0,
  status text not null default 'processing'::text,
  error_message text,
  created_at timestamp with time zone not null default now(),
  completed_at timestamp with time zone
);

create table public.radar_price_models (
  seller_id uuid not null,
  model_token text not null,
  brand_name_hint text,
  first_seen_at timestamp with time zone not null default now(),
  last_seen_at timestamp with time zone not null default now()
);

create table public.radar_actions (
  id uuid not null default gen_random_uuid(),
  seller_id uuid not null,
  query_id uuid,
  action_type text not null,
  created_at timestamp with time zone not null default now()
);


-- ─── PRIMARY KEYS ───────────────────────────────────────────────────────────
alter table public.sellers add constraint sellers_pkey PRIMARY KEY (id);
alter table public.data_connections add constraint data_connections_pkey PRIMARY KEY (id);
alter table public.products add constraint products_pkey PRIMARY KEY (product_id);
alter table public.inventory_snapshots add constraint inventory_snapshots_pkey PRIMARY KEY (snapshot_id);
alter table public.inventory_events add constraint inventory_events_pkey PRIMARY KEY (event_id);
alter table public.tvelo_metrics add constraint tvelo_metrics_pkey PRIMARY KEY (id);
alter table public.store_metrics add constraint store_metrics_pkey PRIMARY KEY (id);
alter table public.changelog add constraint changelog_pkey PRIMARY KEY (id);
alter table public.alerts add constraint alerts_pkey PRIMARY KEY (id);
alter table public.price_elasticity add constraint price_elasticity_pkey PRIMARY KEY (id);
alter table public.system_settings add constraint system_settings_pkey PRIMARY KEY (key);
alter table public.recalc_jobs add constraint recalc_jobs_pkey PRIMARY KEY (seller_id);
alter table public.robokassa_invoices add constraint robokassa_invoices_pkey PRIMARY KEY (id);
alter table public.notification_subscriptions add constraint notification_subscriptions_pkey PRIMARY KEY (id);
alter table public.report_history add constraint report_history_pkey PRIMARY KEY (id);
alter table public.warehouse_metrics add constraint warehouse_metrics_pkey PRIMARY KEY (id);
alter table public.warehouse_metrics_history add constraint warehouse_metrics_history_pkey PRIMARY KEY (id);
alter table public.radar_brands add constraint radar_brands_pkey PRIMARY KEY (id);
alter table public.radar_queries add constraint radar_queries_pkey PRIMARY KEY (id);
alter table public.radar_query_history add constraint radar_query_history_pkey PRIMARY KEY (id);
alter table public.radar_cache add constraint radar_cache_pkey PRIMARY KEY (id);
alter table public.radar_price_uploads add constraint radar_price_uploads_pkey PRIMARY KEY (id);
alter table public.radar_price_models add constraint radar_price_models_pkey PRIMARY KEY (seller_id, model_token);
alter table public.radar_actions add constraint radar_actions_pkey PRIMARY KEY (id);


-- ─── UNIQUE CONSTRAINTS ─────────────────────────────────────────────────────
alter table public.products add constraint products_seller_connection_sku_key UNIQUE (seller_id, connection_id, sku);
alter table public.tvelo_metrics add constraint tvelo_metrics_product_id_period_start_period_end_key UNIQUE (product_id, period_start, period_end);
alter table public.store_metrics add constraint store_metrics_seller_id_period_start_period_end_key UNIQUE (seller_id, period_start, period_end);
alter table public.price_elasticity add constraint price_elasticity_product_id_change_date_key UNIQUE (product_id, change_date);
alter table public.robokassa_invoices add constraint robokassa_invoices_inv_id_key UNIQUE (inv_id);
alter table public.notification_subscriptions add constraint notification_subscriptions_seller_id_kind_channel_key UNIQUE (seller_id, kind, channel);
alter table public.warehouse_metrics add constraint warehouse_metrics_seller_conn_period_uniq UNIQUE (seller_id, connection_id, period_start, period_end);
alter table public.radar_brands add constraint radar_brands_seller_name_uniq UNIQUE (seller_id, name_normalized);
alter table public.radar_queries add constraint radar_queries_brand_text_uniq UNIQUE (brand_id, query_normalized);
alter table public.radar_query_history add constraint radar_query_history_uniq UNIQUE (query_id, period_year, period_month);
alter table public.radar_cache add constraint radar_cache_cache_key_key UNIQUE (cache_key);


-- ─── FOREIGN KEYS ───────────────────────────────────────────────────────────
alter table public.sellers add constraint sellers_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.data_connections add constraint data_connections_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE;
alter table public.products add constraint products_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE;
alter table public.products add constraint products_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES data_connections(id) ON DELETE CASCADE;
alter table public.inventory_snapshots add constraint inventory_snapshots_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE;
alter table public.inventory_snapshots add constraint inventory_snapshots_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES data_connections(id) ON DELETE SET NULL;
alter table public.inventory_events add constraint inventory_events_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE;
alter table public.inventory_events add constraint inventory_events_previous_snapshot_id_fkey FOREIGN KEY (previous_snapshot_id) REFERENCES inventory_snapshots(snapshot_id) ON DELETE SET NULL;
alter table public.inventory_events add constraint inventory_events_current_snapshot_id_fkey FOREIGN KEY (current_snapshot_id) REFERENCES inventory_snapshots(snapshot_id) ON DELETE CASCADE;
alter table public.tvelo_metrics add constraint tvelo_metrics_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE;
alter table public.store_metrics add constraint store_metrics_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE;
alter table public.changelog add constraint changelog_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE;
alter table public.changelog add constraint changelog_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE;
alter table public.alerts add constraint alerts_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE;
alter table public.alerts add constraint alerts_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE;
alter table public.price_elasticity add constraint price_elasticity_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE;
alter table public.price_elasticity add constraint price_elasticity_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE;
alter table public.system_settings add constraint system_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
alter table public.recalc_jobs add constraint recalc_jobs_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE;
alter table public.robokassa_invoices add constraint robokassa_invoices_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE;
alter table public.notification_subscriptions add constraint notification_subscriptions_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE;
alter table public.report_history add constraint report_history_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE;
alter table public.warehouse_metrics add constraint warehouse_metrics_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE;
alter table public.warehouse_metrics add constraint warehouse_metrics_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES data_connections(id) ON DELETE CASCADE;
alter table public.warehouse_metrics_history add constraint warehouse_metrics_history_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE;
alter table public.warehouse_metrics_history add constraint warehouse_metrics_history_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES data_connections(id) ON DELETE CASCADE;
alter table public.radar_brands add constraint radar_brands_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE;
alter table public.radar_queries add constraint radar_queries_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE;
alter table public.radar_queries add constraint radar_queries_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES radar_brands(id) ON DELETE CASCADE;
alter table public.radar_query_history add constraint radar_query_history_query_id_fkey FOREIGN KEY (query_id) REFERENCES radar_queries(id) ON DELETE CASCADE;
alter table public.radar_price_uploads add constraint radar_price_uploads_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE;
alter table public.radar_price_models add constraint radar_price_models_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE;
alter table public.radar_actions add constraint radar_actions_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE;
alter table public.radar_actions add constraint radar_actions_query_id_fkey FOREIGN KEY (query_id) REFERENCES radar_queries(id) ON DELETE CASCADE;


-- ─── CHECK CONSTRAINTS ──────────────────────────────────────────────────────
alter table public.inventory_snapshots add constraint inventory_snapshots_stock_quantity_check CHECK ((stock_quantity >= 0));
alter table public.inventory_snapshots add constraint inventory_snapshots_price_check CHECK ((price >= (0)::numeric));
alter table public.tvelo_metrics add constraint tvelo_metrics_confidence_score_check CHECK (((confidence_score >= (0)::numeric) AND (confidence_score <= (100)::numeric)));
alter table public.recalc_jobs add constraint recalc_jobs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'done'::text, 'error'::text])));
alter table public.robokassa_invoices add constraint robokassa_invoices_plan_check CHECK ((plan = ANY (ARRAY['starter'::text, 'growth'::text, 'pro'::text, 'radar_start'::text, 'radar_seller'::text, 'radar_pro'::text, 'radar_expert'::text])));
alter table public.robokassa_invoices add constraint robokassa_invoices_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'expired'::text])));
alter table public.robokassa_invoices add constraint robokassa_invoices_product_kind_check CHECK ((product_kind = ANY (ARRAY['veloseller'::text, 'radar'::text])));
alter table public.sellers add constraint sellers_radar_plan_check CHECK ((radar_plan = ANY (ARRAY['none'::text, 'trial'::text, 'start'::text, 'seller'::text, 'pro'::text, 'expert'::text])));
alter table public.radar_brands add constraint radar_brands_status_check CHECK ((status = ANY (ARRAY['approved'::text, 'excluded'::text])));
alter table public.radar_brands add constraint radar_brands_source_check CHECK ((source = ANY (ARRAY['ai'::text, 'manual'::text])));
alter table public.radar_price_uploads add constraint radar_price_uploads_status_check CHECK ((status = ANY (ARRAY['processing'::text, 'completed'::text, 'failed'::text])));
alter table public.radar_queries add constraint radar_queries_status_check CHECK ((status = ANY (ARRAY['early'::text, 'new'::text, 'watching'::text, 'archived'::text])));
alter table public.radar_query_history add constraint radar_query_history_period_month_check CHECK (((period_month >= 1) AND (period_month <= 12)));


-- ─── INDEXES (non-constraint) ───────────────────────────────────────────────
CREATE UNIQUE INDEX alerts_unique_unread ON public.alerts USING btree (seller_id, product_id, kind) WHERE (acknowledged_at IS NULL);
CREATE INDEX idx_alerts_product ON public.alerts USING btree (product_id);
CREATE INDEX idx_alerts_seller ON public.alerts USING btree (seller_id, created_at DESC) WHERE (acknowledged_at IS NULL);
CREATE INDEX idx_alerts_seller_kind ON public.alerts USING btree (seller_id, kind);
CREATE INDEX idx_changelog_product ON public.changelog USING btree (product_id, event_date DESC);
CREATE INDEX idx_changelog_seller_date ON public.changelog USING btree (seller_id, event_date DESC);
CREATE INDEX idx_changelog_seller_event_type ON public.changelog USING btree (seller_id, event_type);
CREATE INDEX idx_data_connections_seller ON public.data_connections USING btree (seller_id);
CREATE INDEX idx_data_connections_seller_kind ON public.data_connections USING btree (seller_id, warehouse_kind);
CREATE INDEX idx_data_connections_seller_status ON public.data_connections USING btree (seller_id, status);
CREATE INDEX idx_data_connections_status_sync ON public.data_connections USING btree (status, last_sync_at) WHERE (status = 'active'::connection_status);
CREATE INDEX idx_events_curr_snapshot ON public.inventory_events USING btree (current_snapshot_id);
CREATE INDEX idx_events_prev_snapshot ON public.inventory_events USING btree (previous_snapshot_id) WHERE (previous_snapshot_id IS NOT NULL);
CREATE INDEX idx_events_product_date ON public.inventory_events USING btree (product_id, event_date DESC);
CREATE INDEX idx_events_product_time ON public.inventory_events USING btree (product_id, event_time DESC);
CREATE INDEX idx_events_type ON public.inventory_events USING btree (event_type);
CREATE INDEX idx_snapshots_connection ON public.inventory_snapshots USING btree (connection_id) WHERE (connection_id IS NOT NULL);
CREATE INDEX idx_snapshots_connection_time ON public.inventory_snapshots USING btree (connection_id, snapshot_time DESC) WHERE (connection_id IS NOT NULL);
CREATE INDEX idx_snapshots_product_time ON public.inventory_snapshots USING btree (product_id, snapshot_time DESC);
CREATE INDEX idx_snapshots_time ON public.inventory_snapshots USING btree (snapshot_time DESC);
CREATE INDEX idx_notification_subscriptions_dispatch ON public.notification_subscriptions USING btree (enabled, frequency) WHERE (enabled = true);
CREATE INDEX idx_notification_subscriptions_seller ON public.notification_subscriptions USING btree (seller_id);
CREATE INDEX idx_elasticity_product ON public.price_elasticity USING btree (product_id, change_date DESC);
CREATE INDEX idx_elasticity_seller ON public.price_elasticity USING btree (seller_id, computed_at DESC);
CREATE INDEX idx_products_connection_id ON public.products USING btree (connection_id);
CREATE INDEX idx_products_seller ON public.products USING btree (seller_id);
CREATE INDEX idx_radar_actions_seller ON public.radar_actions USING btree (seller_id, created_at DESC);
CREATE INDEX idx_radar_brands_last_wordstat ON public.radar_brands USING btree (last_wordstat_at NULLS FIRST) WHERE (status = 'approved'::text);
CREATE INDEX idx_radar_brands_normalized ON public.radar_brands USING btree (name_normalized);
CREATE INDEX idx_radar_brands_seller_status ON public.radar_brands USING btree (seller_id, status);
CREATE UNIQUE INDEX radar_brands_seller_normalized_uniq ON public.radar_brands USING btree (seller_id, name_normalized);
CREATE INDEX idx_radar_cache_expires ON public.radar_cache USING btree (expires_at);
CREATE INDEX idx_radar_cache_provider ON public.radar_cache USING btree (provider, created_at DESC);
CREATE INDEX idx_radar_cache_provider_expires ON public.radar_cache USING btree (provider, expires_at);
CREATE INDEX idx_radar_price_models_seller ON public.radar_price_models USING btree (seller_id);
CREATE INDEX idx_radar_price_uploads_seller ON public.radar_price_uploads USING btree (seller_id, created_at DESC);
CREATE INDEX idx_radar_queries_brand ON public.radar_queries USING btree (brand_id);
CREATE INDEX idx_radar_queries_favorite ON public.radar_queries USING btree (seller_id, is_favorite) WHERE (is_favorite = true);
CREATE INDEX idx_radar_queries_first_seen ON public.radar_queries USING btree (first_seen_at DESC);
CREATE INDEX idx_radar_queries_normalized ON public.radar_queries USING btree (query_normalized);
CREATE INDEX idx_radar_queries_seller_favorite ON public.radar_queries USING btree (seller_id, is_favorite) WHERE (is_favorite = true);
CREATE INDEX idx_radar_queries_seller_status ON public.radar_queries USING btree (seller_id, status);
CREATE INDEX idx_radar_queries_seller_status_freq ON public.radar_queries USING btree (seller_id, status, current_frequency DESC NULLS LAST);
CREATE UNIQUE INDEX radar_queries_seller_brand_norm_uniq ON public.radar_queries USING btree (seller_id, brand_id, query_normalized);
CREATE INDEX idx_radar_query_history_query ON public.radar_query_history USING btree (query_id, period_year, period_month);
CREATE INDEX idx_recalc_jobs_stuck ON public.recalc_jobs USING btree (started_at) WHERE (status = 'running'::text);
CREATE INDEX idx_report_history_seller_date_channel ON public.report_history USING btree (seller_id, sent_date, channel);
CREATE INDEX idx_report_history_seller_sent ON public.report_history USING btree (seller_id, sent_at DESC);
CREATE UNIQUE INDEX report_history_seller_channel_date_uniq ON public.report_history USING btree (seller_id, channel, sent_date);
CREATE INDEX idx_robokassa_invoices_seller ON public.robokassa_invoices USING btree (seller_id);
CREATE INDEX idx_robokassa_invoices_status ON public.robokassa_invoices USING btree (status);
CREATE INDEX idx_sellers_email ON public.sellers USING btree (email);
CREATE INDEX idx_sellers_payment_failed ON public.sellers USING btree (last_payment_failed_at) WHERE (last_payment_failed_at IS NOT NULL);
CREATE INDEX idx_sellers_plan ON public.sellers USING btree (plan);
CREATE INDEX idx_sellers_stripe_customer ON public.sellers USING btree (stripe_customer_id) WHERE (stripe_customer_id IS NOT NULL);
CREATE INDEX idx_sellers_subscription_expires ON public.sellers USING btree (subscription_expires_at) WHERE (subscription_expires_at IS NOT NULL);
CREATE INDEX idx_sellers_trial_ends ON public.sellers USING btree (trial_ends_at) WHERE (plan = 'trial'::text);
CREATE INDEX idx_store_metrics_seller ON public.store_metrics USING btree (seller_id);
CREATE INDEX idx_system_settings_category ON public.system_settings USING btree (category);
CREATE INDEX idx_system_settings_updated_by ON public.system_settings USING btree (updated_by);
CREATE INDEX idx_tvelo_period ON public.tvelo_metrics USING btree (period_start, period_end);
CREATE INDEX idx_tvelo_period_end_desc ON public.tvelo_metrics USING btree (period_end DESC);
CREATE INDEX idx_tvelo_product ON public.tvelo_metrics USING btree (product_id);
CREATE INDEX idx_tvelo_product_period_desc ON public.tvelo_metrics USING btree (product_id, period_end DESC);
CREATE INDEX idx_warehouse_metrics_seller_conn_period ON public.warehouse_metrics USING btree (seller_id, connection_id, period_end DESC);
CREATE INDEX warehouse_metrics_history_by_warehouse_period_end ON public.warehouse_metrics_history USING btree (seller_id, connection_id, period_end DESC);
CREATE UNIQUE INDEX warehouse_metrics_history_uniq ON public.warehouse_metrics_history USING btree (seller_id, connection_id, period_start, period_end);


-- ─── FUNCTIONS & RPC ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.plan_sku_limit(p text)
 RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $function$
  select case p when 'trial' then 50 when 'starter' then 500 when 'growth' then 4000 when 'pro' then 10000 else 50 end
$function$;

CREATE OR REPLACE FUNCTION public.enforce_sku_limit()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  insert into sellers (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', new.email));
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_default_notification_subscriptions()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
    INSERT INTO public.notification_subscriptions (seller_id, kind, channel, enabled, params)
    VALUES
        (NEW.id, 'low_stock',          'email', true, '{"coverage_days_threshold": 7,   "day_of_week": 1}'::jsonb),
        (NEW.id, 'critical_stock',     'email', true, '{"coverage_days_threshold": 3,   "day_of_week": 1}'::jsonb),
        (NEW.id, 'dead_inventory',     'email', true, '{"coverage_days_threshold": 180, "day_of_week": 1}'::jsonb),
        (NEW.id, 'repeated_stockout',  'email', true, '{"stockout_days_threshold": 3,   "day_of_week": 1}'::jsonb),
        (NEW.id, 'underestimated_sku', 'email', true, '{"day_of_week": 1}'::jsonb),
        (NEW.id, 'sync_error',         'email', true, '{"day_of_week": 1}'::jsonb),
        (NEW.id, 'weekly_report',      'email', true, '{"day_of_week": 1}'::jsonb)
    ON CONFLICT (seller_id, kind, channel) DO NOTHING;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.touch_radar_brands_updated_at()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_recalc_jobs_touch()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_warehouses_limit_on_plan_change()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $function$
BEGIN
  IF NEW.plan IS DISTINCT FROM OLD.plan THEN
    NEW.plan_warehouses_limit := CASE NEW.plan
      WHEN 'trial'    THEN 15
      WHEN 'starter'  THEN 2
      WHEN 'growth'   THEN 6
      WHEN 'pro'      THEN 15
      ELSE 15
    END;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.try_acquire_recalc_lock(p_seller_id uuid, p_worker_id text DEFAULT NULL::text, p_stale_after interval DEFAULT '01:00:00'::interval)
 RETURNS boolean LANGUAGE plpgsql SET search_path TO ''
AS $function$
DECLARE
  v_acquired boolean := false;
BEGIN
  INSERT INTO public.recalc_jobs (seller_id, status, started_at, worker_id, finished_at, result, error_text, progress)
  VALUES (p_seller_id, 'running', pg_catalog.now(), p_worker_id, NULL, NULL, NULL, NULL)
  ON CONFLICT (seller_id) DO UPDATE
    SET status = 'running',
        started_at = pg_catalog.now(),
        finished_at = NULL,
        result = NULL,
        error_text = NULL,
        progress = NULL,
        worker_id = EXCLUDED.worker_id
    WHERE public.recalc_jobs.status IN ('done', 'error')
       OR public.recalc_jobs.started_at < pg_catalog.now() - p_stale_after
  RETURNING true INTO v_acquired;

  RETURN COALESCE(v_acquired, false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_recalc_done(p_seller_id uuid, p_result jsonb)
 RETURNS void LANGUAGE plpgsql SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.recalc_jobs
  SET status = 'done',
      finished_at = pg_catalog.now(),
      result = p_result
  WHERE seller_id = p_seller_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_recalc_error(p_seller_id uuid, p_error_text text)
 RETURNS void LANGUAGE plpgsql SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.recalc_jobs
  SET status = 'error',
      finished_at = pg_catalog.now(),
      error_text = pg_catalog.left(p_error_text, 500)
  WHERE seller_id = p_seller_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_recalc_progress(p_seller_id uuid, p_progress jsonb)
 RETURNS void LANGUAGE plpgsql SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.recalc_jobs
  SET progress = p_progress
  WHERE seller_id = p_seller_id AND status = 'running';
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_dashboard_velocities(p_seller_id uuid, p_connection_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(product_id uuid, adjusted_velocity numeric, confidence_score numeric)
 LANGUAGE sql STABLE SET search_path TO ''
AS $function$
    SELECT DISTINCT ON (tm.product_id)
        tm.product_id,
        tm.adjusted_velocity,
        tm.confidence_score
    FROM public.tvelo_metrics tm
    JOIN public.products p ON p.product_id = tm.product_id
    WHERE p.seller_id = p_seller_id
      AND (p_connection_id IS NULL OR p.connection_id = p_connection_id)
    ORDER BY tm.product_id, tm.period_end DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_concentration_product_ids(p_seller_id uuid, p_connection_id uuid DEFAULT NULL::uuid, p_kind text DEFAULT 'inventory'::text)
 RETURNS TABLE(product_id uuid)
 LANGUAGE sql STABLE SET search_path TO ''
AS $function$
    WITH latest AS (
        SELECT DISTINCT ON (tm.product_id)
            tm.product_id,
            tm.current_stock,
            tm.current_price,
            tm.adjusted_velocity,
            COALESCE(tm.median_30d_velocity, 0) AS median_30d_velocity
        FROM public.tvelo_metrics tm
        JOIN public.products p ON p.product_id = tm.product_id
        WHERE p.seller_id = p_seller_id
          AND (p_connection_id IS NULL OR p.connection_id = p_connection_id)
        ORDER BY tm.product_id, tm.period_end DESC
    ),
    active AS (
        SELECT *
        FROM latest
        WHERE current_stock > 0
           OR adjusted_velocity > 0
           OR median_30d_velocity > 0
    ),
    values AS (
        SELECT
            product_id,
            CASE
                WHEN p_kind = 'demand' THEN
                    CASE
                        WHEN adjusted_velocity > 0 THEN adjusted_velocity * COALESCE(current_price, 0)
                        WHEN median_30d_velocity > 0 THEN median_30d_velocity * COALESCE(current_price, 0)
                        ELSE 1.0
                    END
                ELSE
                    COALESCE(current_stock, 0) * COALESCE(current_price, 0)
            END AS value
        FROM active
    ),
    positive AS (
        SELECT product_id, value FROM values WHERE value > 0
    ),
    ranked AS (
        SELECT
            product_id,
            value,
            SUM(value) OVER (ORDER BY value DESC, product_id) AS cumulative,
            SUM(value) OVER () AS total
        FROM positive
    )
    SELECT product_id
    FROM ranked
    WHERE total > 0
      AND (cumulative - value) < total * 0.5;
$function$;

CREATE OR REPLACE FUNCTION public.get_skus_filter_ranges(p_seller_id uuid, p_connection_id uuid DEFAULT NULL::uuid, p_period_days integer DEFAULT 30)
 RETURNS TABLE(stock_min integer, stock_max integer, oos_min integer, oos_max integer, lost_min numeric, lost_max numeric, coverage_min integer, coverage_max integer)
 LANGUAGE sql STABLE SET search_path TO ''
AS $function$
    WITH latest AS (
        SELECT DISTINCT ON (tm.product_id)
            tm.current_stock,
            tm.stockout_days,
            tm.adjusted_velocity,
            tm.current_price,
            tm.coverage_days,
            tm.period_start,
            tm.period_end
        FROM public.tvelo_metrics tm
        JOIN public.products p ON p.product_id = tm.product_id
        WHERE p.seller_id = p_seller_id
          AND (p_connection_id IS NULL OR p.connection_id = p_connection_id)
          AND ABS(
            EXTRACT(EPOCH FROM (tm.period_end::timestamp - tm.period_start::timestamp))::int / 86400
            - (p_period_days - 1)
          ) <= 1
        ORDER BY tm.product_id, tm.period_end DESC
    )
    SELECT
        COALESCE(MIN(current_stock), 0)::int  AS stock_min,
        COALESCE(MAX(current_stock), 0)::int  AS stock_max,
        COALESCE(MIN(stockout_days), 0)::int  AS oos_min,
        COALESCE(MAX(stockout_days), 0)::int  AS oos_max,
        COALESCE(MIN(adjusted_velocity * stockout_days * current_price), 0)::numeric AS lost_min,
        COALESCE(MAX(adjusted_velocity * stockout_days * current_price), 0)::numeric AS lost_max,
        COALESCE(MIN(coverage_days)::int, 0) AS coverage_min,
        COALESCE(MAX(coverage_days)::int, 365) AS coverage_max
    FROM latest;
$function$;

CREATE OR REPLACE FUNCTION public.get_skus_period_metrics(p_seller_id uuid, p_connection_id uuid, p_period_start date, p_period_end date, p_product_ids uuid[])
 RETURNS TABLE(product_id uuid, velocity numeric, in_stock_days integer, stockout_days integer, sales_units integer, current_stock integer, current_price numeric, coverage_days numeric, lost_revenue numeric)
 LANGUAGE sql STABLE
AS $function$
  WITH
  snaps_dedup AS (
    SELECT DISTINCT ON (s.product_id, (s.snapshot_time AT TIME ZONE 'UTC')::date)
      s.product_id,
      (s.snapshot_time AT TIME ZONE 'UTC')::date AS day,
      s.stock_quantity,
      s.price,
      s.snapshot_time
    FROM inventory_snapshots s
    WHERE s.product_id = ANY(p_product_ids)
      AND (s.snapshot_time AT TIME ZONE 'UTC')::date BETWEEN p_period_start AND p_period_end
    ORDER BY s.product_id, (s.snapshot_time AT TIME ZONE 'UTC')::date, s.snapshot_time DESC
  ),
  days_agg AS (
    SELECT
      product_id,
      COUNT(*) FILTER (WHERE stock_quantity > 0)::int AS in_stock_d,
      COUNT(*) FILTER (WHERE stock_quantity = 0)::int AS stockout_d
    FROM snaps_dedup
    GROUP BY product_id
  ),
  sales_agg AS (
    SELECT
      ie.product_id,
      COALESCE(SUM(ABS(ie.delta_stock)), 0)::int AS sales_u
    FROM inventory_events ie
    WHERE ie.product_id = ANY(p_product_ids)
      AND ie.event_type = 'sales_like'
      AND ie.event_date BETWEEN p_period_start AND p_period_end
    GROUP BY ie.product_id
  ),
  latest_snap AS (
    SELECT DISTINCT ON (s.product_id)
      s.product_id,
      s.stock_quantity AS cur_stock,
      s.price AS cur_price
    FROM inventory_snapshots s
    WHERE s.product_id = ANY(p_product_ids)
      AND (s.snapshot_time AT TIME ZONE 'UTC')::date <= p_period_end
    ORDER BY s.product_id, s.snapshot_time DESC
  )
  SELECT
    p.product_id,
    CASE
      WHEN COALESCE(da.in_stock_d, 0) > 0
        THEN COALESCE(sa.sales_u, 0)::numeric / da.in_stock_d
        ELSE 0
    END AS velocity,
    COALESCE(da.in_stock_d, 0) AS in_stock_days,
    COALESCE(da.stockout_d, 0) AS stockout_days,
    COALESCE(sa.sales_u, 0) AS sales_units,
    COALESCE(ls.cur_stock, 0) AS current_stock,
    ls.cur_price AS current_price,
    CASE
      WHEN COALESCE(da.in_stock_d, 0) > 0 AND COALESCE(sa.sales_u, 0) > 0
        THEN COALESCE(ls.cur_stock, 0)::numeric / (sa.sales_u::numeric / da.in_stock_d)
        ELSE NULL
    END AS coverage_days,
    CASE
      WHEN COALESCE(da.in_stock_d, 0) > 0 AND COALESCE(sa.sales_u, 0) > 0
        THEN (sa.sales_u::numeric / da.in_stock_d)
             * COALESCE(da.stockout_d, 0)
             * COALESCE(ls.cur_price, 0)
        ELSE 0
    END AS lost_revenue
  FROM products p
  LEFT JOIN days_agg da ON da.product_id = p.product_id
  LEFT JOIN sales_agg sa ON sa.product_id = p.product_id
  LEFT JOIN latest_snap ls ON ls.product_id = p.product_id
  WHERE p.product_id = ANY(p_product_ids)
    AND p.seller_id = p_seller_id
    AND (p_connection_id IS NULL OR p.connection_id = p_connection_id);
$function$;

CREATE OR REPLACE FUNCTION public.get_warehouse_dashboard_metrics(p_seller_id uuid, p_connection_id uuid, p_period_days integer DEFAULT 30)
 RETURNS TABLE(total_sku_count integer, active_sku_count integer, oos_sku_count integer, inactive_sku_count integer, low_stock_sku_count integer, dead_inventory_sku_count integer, frequently_oos_sku_count integer, total_inventory_value numeric, store_frozen_inventory_value numeric, lost_revenue numeric, potential_revenue numeric, warehouse_health_score numeric, inventory_concentration_50 integer, demand_concentration_50 integer, demand_pattern_distribution jsonb)
 LANGUAGE sql STABLE SET search_path TO ''
AS $function$
    WITH latest AS (
        SELECT DISTINCT ON (tm.product_id)
            tm.product_id,
            COALESCE(tm.current_stock, 0) AS current_stock,
            COALESCE(tm.current_price, 0) AS current_price,
            COALESCE(tm.adjusted_velocity, 0) AS adjusted_velocity,
            COALESCE(tm.median_30d_velocity, 0) AS median_30d_velocity,
            tm.coverage_days,
            COALESCE(tm.stockout_days, 0) AS stockout_days,
            tm.inventory_segment,
            tm.sku_health_score
        FROM public.tvelo_metrics tm
        JOIN public.products p ON p.product_id = tm.product_id
        WHERE p.seller_id = p_seller_id
          AND p.connection_id = p_connection_id
          AND ABS((tm.period_end - tm.period_start) - (p_period_days - 1)) <= 1
        ORDER BY tm.product_id, tm.period_end DESC
    ),
    classified AS (
        SELECT
            l.*,
            (l.current_stock = 0 AND l.adjusted_velocity = 0) AS is_inactive,
            (l.current_stock > 0 OR l.adjusted_velocity > 0)  AS is_active
        FROM latest l
    ),
    counts AS (
        SELECT
            COUNT(*)::int AS total_sku_count,
            SUM(CASE WHEN is_active THEN 1 ELSE 0 END)::int AS active_sku_count,
            SUM(CASE WHEN current_stock = 0 AND adjusted_velocity > 0 THEN 1 ELSE 0 END)::int AS oos_sku_count,
            SUM(CASE WHEN is_inactive THEN 1 ELSE 0 END)::int AS inactive_sku_count,
            SUM(CASE WHEN coverage_days IS NOT NULL AND coverage_days <= 7 AND current_stock > 0 THEN 1 ELSE 0 END)::int AS low_stock_sku_count,
            SUM(CASE WHEN coverage_days IS NOT NULL AND coverage_days > 180 THEN 1 ELSE 0 END)::int AS dead_inventory_sku_count,
            SUM(CASE WHEN stockout_days > 15 THEN 1 ELSE 0 END)::int AS frequently_oos_sku_count
        FROM classified
    ),
    money AS (
        SELECT
            COALESCE(SUM(current_stock * current_price) FILTER (WHERE is_active), 0)::numeric AS total_inventory_value,
            COALESCE(SUM(CASE WHEN is_active AND coverage_days IS NOT NULL AND coverage_days > 180
                              THEN current_stock * current_price ELSE 0 END), 0)::numeric AS store_frozen_inventory_value,
            COALESCE(SUM(CASE WHEN is_active AND adjusted_velocity > 0 AND stockout_days > 0
                              THEN adjusted_velocity * stockout_days * current_price ELSE 0 END), 0)::numeric AS lost_revenue,
            COALESCE(SUM(CASE WHEN is_active AND adjusted_velocity > 0
                              THEN adjusted_velocity * current_price * p_period_days ELSE 0 END), 0)::numeric AS potential_revenue
        FROM classified
    ),
    health AS (
        SELECT ROUND(AVG(sku_health_score)::numeric, 2) AS warehouse_health_score
        FROM classified
        WHERE is_active AND sku_health_score IS NOT NULL
    ),
    inv_conc AS (
        WITH active_inv AS (
            SELECT product_id, current_stock * current_price AS value
            FROM classified
            WHERE is_active AND current_stock * current_price > 0
        ),
        ranked AS (
            SELECT
                product_id, value,
                SUM(value) OVER (ORDER BY value DESC, product_id) AS cumulative,
                SUM(value) OVER () AS total
            FROM active_inv
        )
        SELECT COUNT(*)::int AS inventory_concentration_50
        FROM ranked
        WHERE total > 0 AND (cumulative - value) < total * 0.5
    ),
    dem_conc AS (
        WITH active_dem AS (
            SELECT
                product_id,
                CASE
                    WHEN adjusted_velocity > 0     THEN adjusted_velocity * current_price
                    WHEN median_30d_velocity > 0   THEN median_30d_velocity * current_price
                    ELSE 0
                END AS value
            FROM classified
            WHERE is_active
        ),
        positive AS (
            SELECT product_id, value FROM active_dem WHERE value > 0
        ),
        ranked AS (
            SELECT
                product_id, value,
                SUM(value) OVER (ORDER BY value DESC, product_id) AS cumulative,
                SUM(value) OVER () AS total
            FROM positive
        )
        SELECT COUNT(*)::int AS demand_concentration_50
        FROM ranked
        WHERE total > 0 AND (cumulative - value) < total * 0.5
    ),
    distrib AS (
        SELECT COALESCE(
            jsonb_object_agg(
                COALESCE(inventory_segment::text, 'insufficient_data'),
                cnt
            ),
            '{}'::jsonb
        ) AS demand_pattern_distribution
        FROM (
            SELECT inventory_segment, COUNT(*) AS cnt
            FROM classified
            WHERE is_active
            GROUP BY inventory_segment
        ) seg
    )
    SELECT
        counts.total_sku_count,
        counts.active_sku_count,
        counts.oos_sku_count,
        counts.inactive_sku_count,
        counts.low_stock_sku_count,
        counts.dead_inventory_sku_count,
        counts.frequently_oos_sku_count,
        money.total_inventory_value,
        money.store_frozen_inventory_value,
        money.lost_revenue,
        money.potential_revenue,
        health.warehouse_health_score,
        inv_conc.inventory_concentration_50,
        dem_conc.demand_concentration_50,
        distrib.demand_pattern_distribution
    FROM counts, money, health, inv_conc, dem_conc, distrib;
$function$;

CREATE OR REPLACE FUNCTION public.get_sync_log_history(p_seller_id uuid, p_days integer DEFAULT 14)
 RETURNS TABLE(sync_date date, connection_id uuid, snapshots_count bigint, last_snapshot_time timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    s.snapshot_time::date AS sync_date,
    p.connection_id,
    COUNT(*) AS snapshots_count,
    MAX(s.snapshot_time) AS last_snapshot_time
  FROM inventory_snapshots s
  INNER JOIN products p ON p.product_id = s.product_id
  WHERE p.seller_id = p_seller_id
    AND s.snapshot_time >= NOW() - (p_days || ' days')::interval
    AND p.connection_id IS NOT NULL
  GROUP BY s.snapshot_time::date, p.connection_id
  ORDER BY last_snapshot_time DESC;
$function$;

CREATE OR REPLACE FUNCTION public.admin_connection_data_age()
 RETURNS TABLE(connection_id uuid, seller_id uuid, seller_email text, connection_name text, marketplace text, source text, status text, last_sync_at timestamp with time zone, hours_since_last_sync numeric, first_snapshot_at timestamp with time zone, last_snapshot_at timestamp with time zone, days_of_history integer, snapshots_count bigint, last_error text)
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    dc.id            AS connection_id,
    dc.seller_id,
    s.email          AS seller_email,
    dc.name          AS connection_name,
    dc.marketplace,
    dc.source::text  AS source,
    dc.status::text  AS status,
    dc.last_sync_at,
    CASE
      WHEN dc.last_sync_at IS NULL THEN NULL
      ELSE EXTRACT(EPOCH FROM (now() - dc.last_sync_at)) / 3600.0
    END              AS hours_since_last_sync,
    snap.first_snapshot_at,
    snap.last_snapshot_at,
    CASE
      WHEN snap.first_snapshot_at IS NULL THEN 0
      ELSE FLOOR(EXTRACT(EPOCH FROM (now() - snap.first_snapshot_at)) / 86400.0)::integer
    END              AS days_of_history,
    COALESCE(snap.snapshots_count, 0) AS snapshots_count,
    dc.last_error
  FROM data_connections dc
  LEFT JOIN sellers s ON s.id = dc.seller_id
  LEFT JOIN LATERAL (
    SELECT
      MIN(snapshot_time) AS first_snapshot_at,
      MAX(snapshot_time) AS last_snapshot_at,
      COUNT(*)           AS snapshots_count
    FROM inventory_snapshots
    WHERE connection_id = dc.id
  ) snap ON true
  WHERE dc.status IN ('active', 'error', 'paused')
  ORDER BY
    CASE WHEN dc.status = 'error' THEN 0 ELSE 1 END,
    dc.last_sync_at NULLS FIRST
  LIMIT 100;
$function$;


-- ─── TRIGGERS ───────────────────────────────────────────────────────────────
CREATE TRIGGER trg_sellers_updated_at BEFORE UPDATE ON public.sellers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_create_default_subscriptions AFTER INSERT ON public.sellers FOR EACH ROW EXECUTE FUNCTION create_default_notification_subscriptions();
CREATE TRIGGER trg_update_warehouses_limit BEFORE UPDATE ON public.sellers FOR EACH ROW EXECUTE FUNCTION update_warehouses_limit_on_plan_change();
CREATE TRIGGER trg_data_connections_updated_at BEFORE UPDATE ON public.data_connections FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_enforce_sku_limit BEFORE INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION enforce_sku_limit();
CREATE TRIGGER set_notification_subscriptions_updated_at BEFORE UPDATE ON public.notification_subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER recalc_jobs_touch BEFORE UPDATE ON public.recalc_jobs FOR EACH ROW EXECUTE FUNCTION trg_recalc_jobs_touch();
CREATE TRIGGER trg_radar_brands_updated_at BEFORE UPDATE ON public.radar_brands FOR EACH ROW EXECUTE FUNCTION touch_radar_brands_updated_at();

-- триггер на auth.users (вне public-схемы, восстановлен вручную):
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();


-- ─── VIEWS ──────────────────────────────────────────────────────────────────
create or replace view public.radar_queries_view with (security_invoker=true) as  SELECT q.id,
    q.seller_id,
    q.brand_id,
    b.name AS brand_name,
    b.name_normalized AS brand_normalized,
    b.source AS brand_source,
    q.query_text,
    q.query_normalized,
    q.status,
    q.is_favorite,
    q.current_frequency,
    q.trend_pct,
    q.present_in_wb,
    q.present_in_ozon,
    q.present_in_wb OR q.present_in_ozon AS in_any_suggest,
    q.suggest_checked_at,
    q.first_seen_at,
    q.last_updated_at,
    EXTRACT(day FROM now() - q.first_seen_at)::integer AS days_since_first_seen
   FROM radar_queries q
     JOIN radar_brands b ON b.id = q.brand_id;


-- ─── ROW LEVEL SECURITY ─────────────────────────────────────────────────────
alter table public.sellers enable row level security;
alter table public.data_connections enable row level security;
alter table public.products enable row level security;
alter table public.inventory_snapshots enable row level security;
alter table public.inventory_events enable row level security;
alter table public.tvelo_metrics enable row level security;
alter table public.store_metrics enable row level security;
alter table public.changelog enable row level security;
alter table public.alerts enable row level security;
alter table public.price_elasticity enable row level security;
alter table public.system_settings enable row level security;
alter table public.recalc_jobs enable row level security;
alter table public.robokassa_invoices enable row level security;
alter table public.notification_subscriptions enable row level security;
alter table public.report_history enable row level security;
alter table public.warehouse_metrics enable row level security;
alter table public.warehouse_metrics_history enable row level security;
alter table public.radar_brands enable row level security;
alter table public.radar_queries enable row level security;
alter table public.radar_query_history enable row level security;
alter table public.radar_cache enable row level security;
alter table public.radar_price_uploads enable row level security;
alter table public.radar_price_models enable row level security;
alter table public.radar_actions enable row level security;


-- ─── RLS POLICIES ───────────────────────────────────────────────────────────
create policy "sellers_self_read" on public.sellers as permissive for select to public using (((select auth.uid() as uid) = id));
create policy "sellers_self_update" on public.sellers as permissive for update to public using (((select auth.uid() as uid) = id));
create policy "sellers_self_insert" on public.sellers as permissive for insert to public with check (((select auth.uid() as uid) = id));

create policy "data_connections_seller_all" on public.data_connections as permissive for all to public using (((select auth.uid() as uid) = seller_id)) with check (((select auth.uid() as uid) = seller_id));

create policy "products_seller_all" on public.products as permissive for all to public using (((select auth.uid() as uid) = seller_id)) with check (((select auth.uid() as uid) = seller_id));

create policy "snapshots_seller_read" on public.inventory_snapshots as permissive for select to public using ((EXISTS ( SELECT 1 FROM products p WHERE ((p.product_id = inventory_snapshots.product_id) AND (p.seller_id = (select auth.uid() as uid))))));

create policy "events_seller_read" on public.inventory_events as permissive for select to public using ((EXISTS ( SELECT 1 FROM products p WHERE ((p.product_id = inventory_events.product_id) AND (p.seller_id = (select auth.uid() as uid))))));

create policy "tvelo_seller_read" on public.tvelo_metrics as permissive for select to public using ((EXISTS ( SELECT 1 FROM products p WHERE ((p.product_id = tvelo_metrics.product_id) AND (p.seller_id = (select auth.uid() as uid))))));

create policy "store_metrics_seller_read" on public.store_metrics as permissive for select to public using (((select auth.uid() as uid) = seller_id));

create policy "changelog_seller_read" on public.changelog as permissive for select to public using (((select auth.uid() as uid) = seller_id));

create policy "alerts_seller_all" on public.alerts as permissive for all to public using (((select auth.uid() as uid) = seller_id)) with check (((select auth.uid() as uid) = seller_id));

create policy "elasticity_seller_read" on public.price_elasticity as permissive for select to public using ((EXISTS ( SELECT 1 FROM products p WHERE ((p.product_id = price_elasticity.product_id) AND (p.seller_id = (select auth.uid() as uid))))));

create policy "system_settings read for authenticated" on public.system_settings as permissive for select to authenticated using (true);

create policy "recalc_jobs_seller_read" on public.recalc_jobs as permissive for select to public using ((seller_id = (select auth.uid() as uid)));

create policy "robokassa_invoices_select_own" on public.robokassa_invoices as permissive for select to public using ((seller_id = (select auth.uid() as uid)));
create policy "robokassa_invoices_insert_own" on public.robokassa_invoices as permissive for insert to public with check ((seller_id = (select auth.uid() as uid)));

create policy "notification_subscriptions_select_own" on public.notification_subscriptions as permissive for select to public using ((seller_id = (select auth.uid() as uid)));
create policy "notification_subscriptions_insert_own" on public.notification_subscriptions as permissive for insert to public with check ((seller_id = (select auth.uid() as uid)));
create policy "notification_subscriptions_update_own" on public.notification_subscriptions as permissive for update to public using ((seller_id = (select auth.uid() as uid))) with check ((seller_id = (select auth.uid() as uid)));
create policy "notification_subscriptions_delete_own" on public.notification_subscriptions as permissive for delete to public using ((seller_id = (select auth.uid() as uid)));

create policy "seller_select_own_reports" on public.report_history as permissive for select to public using ((seller_id = (select auth.uid() as uid)));
create policy "service_role_all_reports" on public.report_history as permissive for all to service_role using (true) with check (true);

create policy "warehouse_metrics_seller_read" on public.warehouse_metrics as permissive for select to authenticated using ((seller_id = (select auth.uid() as uid)));

create policy "sellers_read_own_warehouse_history" on public.warehouse_metrics_history as permissive for select to authenticated using ((seller_id = (select auth.uid() as uid)));
create policy "service_role_manages_warehouse_history" on public.warehouse_metrics_history as permissive for all to service_role using (true) with check (true);

create policy "radar_brands_seller_all" on public.radar_brands as permissive for all to authenticated using ((seller_id = (select auth.uid() as uid))) with check ((seller_id = (select auth.uid() as uid)));

create policy "radar_queries_seller_all" on public.radar_queries as permissive for all to authenticated using ((seller_id = (select auth.uid() as uid))) with check ((seller_id = (select auth.uid() as uid)));

create policy "radar_query_history_seller_read" on public.radar_query_history as permissive for select to authenticated using ((query_id IN ( SELECT radar_queries.id FROM radar_queries WHERE (radar_queries.seller_id = (select auth.uid() as uid)))));

create policy "radar_price_uploads_seller_all" on public.radar_price_uploads as permissive for all to authenticated using ((seller_id = (select auth.uid() as uid))) with check ((seller_id = (select auth.uid() as uid)));

create policy "seller_read_own_price_models" on public.radar_price_models as permissive for select to public using ((seller_id = auth.uid()));
create policy "seller_write_own_price_models" on public.radar_price_models as permissive for all to public using ((seller_id = auth.uid())) with check ((seller_id = auth.uid()));

create policy "radar_actions_seller_all" on public.radar_actions as permissive for all to authenticated using ((seller_id = (select auth.uid() as uid))) with check ((seller_id = (select auth.uid() as uid)));

-- radar_cache: RLS включён, политик нет → доступ только service_role (worker).


-- ─── FUNCTION HARDENING (mirror security-linter миграций) ───────────────────
-- Внутренние триггерные функции недоступны клиентам. RPC (get_*) намеренно
-- сохраняют дефолтный execute (вызываются фронтом через PostgREST).
revoke execute on function public.set_updated_at() from anon, authenticated, public;
revoke execute on function public.enforce_sku_limit() from anon, authenticated, public;
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.create_default_notification_subscriptions() from anon, authenticated, public;
revoke execute on function public.touch_radar_brands_updated_at() from anon, authenticated, public;
revoke execute on function public.trg_recalc_jobs_touch() from anon, authenticated, public;
revoke execute on function public.update_warehouses_limit_on_plan_change() from anon, authenticated, public;


-- ─── SEED: system_settings ──────────────────────────────────────────────────
insert into public.system_settings (key, value, description, category) values
  ('maintenance_mode', 'false'::jsonb, 'Режим обслуживания (показывать заглушку всем)', 'access'),
  ('registration_mode', '"open"'::jsonb, 'Режим регистрации: open / invite / closed', 'access'),
  ('stripe_test_mode', 'true'::jsonb, 'Stripe в test-режиме', 'billing'),
  ('trial_days', '30'::jsonb, 'Длительность триала в днях', 'billing'),
  ('platform_name', '"Veloseller"'::jsonb, 'Отображаемое название платформы', 'branding'),
  ('max_skus_growth', '10000'::jsonb, 'Лимит SKU для Growth плана', 'limits'),
  ('max_skus_pro', '10000'::jsonb, 'Лимит SKU для Pro плана', 'limits'),
  ('max_skus_starter', '10000'::jsonb, 'Лимит SKU для Starter плана', 'limits'),
  ('default_email_enabled', 'true'::jsonb, 'Включать email digest для новых селлеров', 'notifications'),
  ('default_telegram_enabled', 'true'::jsonb, 'Включать Telegram digest для новых селлеров', 'notifications'),
  ('snapshot_frequency_hours', '6'::jsonb, 'Частота снапшотов (часы)', 'pipeline'),
  ('tvelo_min_history_days', '7'::jsonb, 'Минимум дней истории для расчёта TVelo', 'pipeline')
on conflict (key) do nothing;

-- ============================================================================
-- КОНЕЦ SNAPSHOT'А (прод на 01.06.2026, снято через Supabase MCP)
-- ============================================================================
