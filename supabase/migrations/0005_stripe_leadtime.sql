-- Veloseller: Stripe billing + Lead time per product

-- ============================================================================
-- Stripe billing fields на sellers
-- ============================================================================
alter table sellers add column if not exists stripe_customer_id text;
alter table sellers add column if not exists stripe_subscription_id text;
alter table sellers add column if not exists subscription_status text;
alter table sellers add column if not exists current_period_end timestamptz;

create index if not exists idx_sellers_stripe_customer on sellers(stripe_customer_id) where stripe_customer_id is not null;

-- ============================================================================
-- Lead time на уровне SKU (Rule 1.6)
-- Селлер может задать индивидуальное значение, иначе берётся seller default
-- ============================================================================
alter table products add column if not exists lead_time_days integer;
alter table products add column if not exists safety_days integer;

-- Default-значения на селлера
alter table sellers add column if not exists default_lead_time_days integer not null default 14;
alter table sellers add column if not exists default_safety_days integer not null default 7;
