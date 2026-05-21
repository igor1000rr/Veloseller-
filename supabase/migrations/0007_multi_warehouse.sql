-- Veloseller: Multi-warehouse + Stripe payment failure tracking + Telegram notifications
--
-- Эта миграция фиксирует то, что было применено вручную через Supabase SQL Editor
-- в мае 2026. Все операции через `if not exists` / `if exists` — безопасно
-- прокатить на проде где уже всё применено, и на чистой БД.
--
-- ============================================================================
-- data_connections: multi-warehouse (warehouse_kind) + sync failure tracking
-- ============================================================================

alter table data_connections add column if not exists warehouse_kind text;
alter table data_connections add column if not exists failure_count integer not null default 0;
alter table data_connections add column if not exists error_notified_at timestamptz;

-- Допустимые значения warehouse_kind (5 типов из решения Александра, май 2026)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'data_connections_warehouse_kind_check'
  ) then
    alter table data_connections add constraint data_connections_warehouse_kind_check
      check (warehouse_kind is null or warehouse_kind in (
        'ozon_fbo', 'ozon_fbs', 'wb_fbo', 'wb_fbs', 'google_sheet'
      ));
  end if;
end $$;

create index if not exists idx_data_connections_warehouse_kind
  on data_connections(warehouse_kind)
  where warehouse_kind is not null;

-- ============================================================================
-- sellers: лимиты тарифа + Stripe payment tracking + Telegram notifications
-- ============================================================================

-- Тарифные лимиты: trial=15, starter=2, growth=6, pro=15
alter table sellers add column if not exists plan_warehouses_limit integer not null default 15;
alter table sellers add column if not exists subscription_expires_at timestamptz;

-- Уведомления
alter table sellers add column if not exists notify_email boolean not null default true;
alter table sellers add column if not exists notify_telegram boolean not null default false;
alter table sellers add column if not exists telegram_chat_id text;

-- Stripe payment failure tracking (БАГ 103 из stripe-webhook)
alter table sellers add column if not exists payment_failure_count integer not null default 0;
alter table sellers add column if not exists last_payment_failed_at timestamptz;
alter table sellers add column if not exists last_payment_failed_reason text;
alter table sellers add column if not exists last_payment_succeeded_at timestamptz;

-- ============================================================================
-- products: connection_id + UNIQUE (seller_id, connection_id, sku)
-- ============================================================================
--
-- До multi-warehouse: один SKU = одна позиция в products (UNIQUE seller_id, sku).
-- После: один и тот же SKU может быть на разных складах (ozon FBO и WB FBS),
-- поэтому UNIQUE расширяется до (seller_id, connection_id, sku).
--
-- Worker делает upsert с on_conflict="seller_id,connection_id,sku" — старый
-- constraint UNIQUE (seller_id, sku) этому мешает и должен быть удалён.
--

alter table products add column if not exists connection_id uuid;

-- FK на data_connections
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_connection_id_fkey'
  ) then
    alter table products add constraint products_connection_id_fkey
      foreign key (connection_id) references data_connections(id) on delete set null;
  end if;
end $$;

create index if not exists idx_products_connection on products(connection_id) where connection_id is not null;

-- Новый UNIQUE constraint: (seller_id, connection_id, sku)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_seller_connection_sku_uniq'
  ) then
    alter table products add constraint products_seller_connection_sku_uniq
      unique (seller_id, connection_id, sku);
  end if;
end $$;

-- Старый UNIQUE constraint (seller_id, sku) — больше не нужен. Имена создаваемого
-- Postgres'ом дефолтного constraint'а варьируются: products_seller_id_sku_key,
-- products_unique_seller_sku, etc. Пробуем оба известных варианта.
alter table products drop constraint if exists products_seller_id_sku_key;
alter table products drop constraint if exists products_seller_sku_unique;

analyze data_connections;
analyze sellers;
analyze products;
