-- Veloseller: базовая схема
-- Source of truth: Veloseller_Dev_Spec.docx, раздел 1. ДАННЫЕ

-- ============================================================================
-- ENUMS
-- ============================================================================

create type source_type as enum (
  'google_sheet',
  'marketplace_api',
  'csv_upload',
  'feed',
  'manual'
);

create type event_type as enum (
  'first_snapshot',
  'no_change',
  'sales_like',
  'replenishment_like',
  'anomaly_like',
  'recount_like',
  'missing_data'
);

create type marketplace_kind as enum (
  'ozon',
  'wildberries',
  'amazon',
  'shopify'
);

create type connection_status as enum (
  'active',
  'paused',
  'error',
  'pending'
);

create type demand_pattern as enum (
  'stable',
  'unpredictable',
  'seasonal_candidate',
  'insufficient_history'
);

create type inventory_segment as enum (
  'fast_movers',
  'stable',
  'slow_movers',
  'dead_inventory_risk',
  'insufficient_data'
);

create type alert_kind as enum (
  'low_stock',
  'critical_stock',
  'dead_inventory',
  'repeated_stockout',
  'underestimated_sku'
);

-- ============================================================================
-- SELLERS (профиль селлера, привязан к auth.users)
-- ============================================================================

create table sellers (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  -- Timezone для агрегаций по дням (см. п.1.4 спеки)
  timezone text not null default 'UTC',
  plan text not null default 'trial',  -- trial, starter, growth, pro
  trial_ends_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_sellers_email on sellers(email);

-- ============================================================================
-- DATA CONNECTIONS (источники данных селлера)
-- ============================================================================

create table data_connections (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references sellers(id) on delete cascade,
  source source_type not null,
  marketplace marketplace_kind,  -- nullable, заполняется если source = marketplace_api
  name text not null,            -- человекочитаемое имя ('Мой магазин Ozon')
  -- Параметры подключения (зашифрованные secrets хранятся в Supabase Vault)
  config jsonb not null default '{}'::jsonb,
  -- Пример config:
  --   google_sheet: { sheet_id, gid, range, service_account_email }
  --   ozon: { client_id, vault_secret_id }
  --   wildberries: { vault_secret_id }
  --   csv_upload: { last_uploaded_file }
  status connection_status not null default 'pending',
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_data_connections_seller on data_connections(seller_id);

-- ============================================================================
-- PRODUCTS (товары)
-- ============================================================================

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

-- ============================================================================
-- INVENTORY SNAPSHOTS (raw данные склада)
-- ============================================================================

create table inventory_snapshots (
  snapshot_id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(product_id) on delete cascade,
  stock_quantity integer not null check (stock_quantity >= 0),
  price numeric(14, 2) not null check (price >= 0),
  -- Availability рассчитывается из stock_quantity (Rule 1.2)
  availability boolean not null,
  snapshot_time timestamptz not null,
  source source_type not null,
  connection_id uuid references data_connections(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_snapshots_product_time on inventory_snapshots(product_id, snapshot_time desc);
create index idx_snapshots_time on inventory_snapshots(snapshot_time desc);

-- ============================================================================
-- INVENTORY EVENTS (производные события между snapshots)
-- ============================================================================

create table inventory_events (
  event_id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(product_id) on delete cascade,
  previous_snapshot_id uuid references inventory_snapshots(snapshot_id) on delete set null,
  current_snapshot_id uuid not null references inventory_snapshots(snapshot_id) on delete cascade,
  event_time timestamptz not null,
  event_date date not null,                  -- денормализация для агрегаций по seller.timezone
  delta_stock integer,                       -- nullable для first_snapshot
  event_type event_type not null,
  -- Если true, событие исключено из confirmed metrics (Rules 3.x)
  excluded_from_confirmed_metrics boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_events_product_time on inventory_events(product_id, event_time desc);
create index idx_events_product_date on inventory_events(product_id, event_date desc);
create index idx_events_type on inventory_events(event_type);

-- ============================================================================
-- TVELO METRICS (агрегаты по товару за период)
-- ============================================================================

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
  coverage_days numeric(14, 4),              -- null если adjusted_velocity = 0
  current_stock integer not null default 0,
  current_price numeric(14, 2),
  inventory_segment inventory_segment,
  sku_health_score numeric(5, 2),            -- 0..100, см. Rule 13.1
  -- Расшифровка confidence_score (Rule 6.7): { sales_like, replenishment_like, anomaly_like, missing_data }
  confidence_breakdown jsonb not null default '{}'::jsonb,
  underestimated_sku boolean not null default false,
  computed_at timestamptz not null default now(),
  unique (product_id, period_start, period_end)
);

create index idx_tvelo_product on tvelo_metrics(product_id);
create index idx_tvelo_period on tvelo_metrics(period_start, period_end);

-- ============================================================================
-- STORE METRICS (агрегаты по складу селлера за период)
-- ============================================================================

create table store_metrics (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references sellers(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  total_sku_count integer not null default 0,
  oos_sku_count integer not null default 0,
  low_stock_sku_count integer not null default 0,
  dead_inventory_sku_count integer not null default 0,
  inventory_concentration_50 integer,         -- сколько SKU дают 50% остатков по деньгам
  demand_concentration_50 integer,            -- сколько SKU дают 50% спроса
  total_inventory_value numeric(14, 2) not null default 0,
  store_frozen_inventory_value numeric(14, 2) not null default 0,
  lost_revenue numeric(14, 2) not null default 0,
  warehouse_health_score numeric(5, 2),       -- 0..100, см. Rule 13.2
  demand_pattern_distribution jsonb not null default '{}'::jsonb,  -- { stable: N, seasonal: N, ... }
  computed_at timestamptz not null default now(),
  unique (seller_id, period_start, period_end)
);

create index idx_store_metrics_seller on store_metrics(seller_id);

-- ============================================================================
-- CHANGELOG (Rule 11.x)
-- ============================================================================

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

-- ============================================================================
-- ALERTS (Rule 10.x)
-- ============================================================================

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

-- ============================================================================
-- TRIGGERS: updated_at
-- ============================================================================

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_sellers_updated_at before update on sellers
  for each row execute function set_updated_at();

create trigger trg_products_updated_at before update on products
  for each row execute function set_updated_at();

create trigger trg_data_connections_updated_at before update on data_connections
  for each row execute function set_updated_at();
