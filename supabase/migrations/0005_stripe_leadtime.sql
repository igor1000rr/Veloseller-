-- Veloseller: Stripe billing + Lead time per product
alter table sellers add column if not exists stripe_customer_id text;
alter table sellers add column if not exists stripe_subscription_id text;
alter table sellers add column if not exists subscription_status text;
alter table sellers add column if not exists current_period_end timestamptz;
create index if not exists idx_sellers_stripe_customer on sellers(stripe_customer_id) where stripe_customer_id is not null;

alter table products add column if not exists lead_time_days integer;
alter table products add column if not exists safety_days integer;
alter table sellers add column if not exists default_lead_time_days integer not null default 14;
alter table sellers add column if not exists default_safety_days integer not null default 7;
