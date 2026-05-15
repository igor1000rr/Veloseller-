-- Veloseller: Price elasticity history + SKU limits enforcement по тарифам

-- ============================================================================
-- PRICE ELASTICITY (Rule 12.3) — история изменений цены и их влияние на velocity
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
  price_impact_percent numeric(8, 2),     -- (vel_after - vel_before) / vel_before * 100
  days_before integer not null default 0,
  days_after integer not null default 0,
  computed_at timestamptz not null default now(),
  unique (product_id, change_date)
);

create index if not exists idx_elasticity_product on price_elasticity(product_id, change_date desc);
create index if not exists idx_elasticity_seller on price_elasticity(seller_id, computed_at desc);

alter table price_elasticity enable row level security;
drop policy if exists "elasticity_seller_read" on price_elasticity;
create policy "elasticity_seller_read" on price_elasticity
  for select using (
    exists (select 1 from products p where p.product_id = price_elasticity.product_id and p.seller_id = auth.uid())
  );

-- ============================================================================
-- SKU LIMITS по тарифам (раздел "Бизнес-модель" из Project.docx)
-- trial / starter / growth / pro -> 50 / 500 / 4000 / 10000 SKU
-- ============================================================================

create or replace function plan_sku_limit(p text) returns integer
language sql immutable as $$
  select case p
    when 'trial' then 50
    when 'starter' then 500
    when 'growth' then 4000
    when 'pro' then 10000
    else 50
  end
$$;

create or replace function enforce_sku_limit() returns trigger
language plpgsql security definer as $$
declare
  current_count integer;
  max_allowed integer;
  seller_plan text;
begin
  select plan into seller_plan from sellers where id = new.seller_id;
  max_allowed := plan_sku_limit(coalesce(seller_plan, 'trial'));
  select count(*) into current_count from products where seller_id = new.seller_id;
  if current_count >= max_allowed then
    raise exception 'SKU limit reached: % allows up to % SKUs (current: %). Upgrade your plan at /billing.',
      coalesce(seller_plan, 'trial'), max_allowed, current_count
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_sku_limit on products;
create trigger trg_enforce_sku_limit
  before insert on products
  for each row execute function enforce_sku_limit();
