-- Календарь событий по товарам и складам (фича «Календарь событий»).
--
-- product_id IS NULL  → общее событие склада (привязано к connection_id);
--                       при чтении «дублируется» во все товары этого склада.
-- product_id NOT NULL → событие конкретного товара.
-- Праздники здесь НЕ хранятся — они виртуальные (apps/web/lib/holidays.ts), read-only.
--
-- RLS-политика зеркалит products_seller_all: (select auth.uid()) = seller_id.
-- Идемпотентно.
create table if not exists public.product_events (
  id            uuid primary key default gen_random_uuid(),
  seller_id     uuid not null references public.sellers(id) on delete cascade,
  connection_id uuid not null references public.data_connections(id) on delete cascade,
  product_id    uuid references public.products(product_id) on delete cascade,
  title         text not null,
  start_date    date not null,
  end_date      date,
  comment       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint product_events_title_len   check (char_length(title) <= 100),
  constraint product_events_comment_len check (comment is null or char_length(comment) <= 1000),
  constraint product_events_date_order  check (end_date is null or end_date >= start_date)
);

create index if not exists idx_product_events_product
  on public.product_events (seller_id, product_id) where product_id is not null;
create index if not exists idx_product_events_conn
  on public.product_events (seller_id, connection_id);

alter table public.product_events enable row level security;

drop policy if exists product_events_seller_all on public.product_events;
create policy product_events_seller_all on public.product_events
  for all
  using ((select auth.uid()) = seller_id)
  with check ((select auth.uid()) = seller_id);
