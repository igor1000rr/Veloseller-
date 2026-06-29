-- wb_price_coverage(): покрытие ценами по WB-складам текущего продавца.
--
-- Зачем: если у токена WB не включена категория «Цены и скидки» (Discounts-Prices
-- API отдаёт 403), цены по FBS-товарам без FBO-остатка не загружаются → price=0 →
-- «заморожено» и потерянная выручка считаются как 0. Код синка корректен (у
-- продавцов с этой категорией покрытие ~60%+), это конфиг токена. Чтобы продавец
-- ВИДЕЛ причину, страница складов показывает подсказку при низком покрытии —
-- эта функция отдаёт агрегат (по последнему снапшоту на товар за 3 дня).
--
-- security definer + явный фильтр dc.seller_id = auth.uid(): функция возвращает
-- ТОЛЬКО данные вызывающего продавца, независимо от RLS на inventory_snapshots.

create or replace function public.wb_price_coverage()
returns table(connection_id uuid, stocked int, stocked_priced int)
language sql
stable
security definer
set search_path = public
as $$
  with latest as (
    select distinct on (s.connection_id, s.product_id)
      s.connection_id, s.product_id, s.price, s.stock_quantity
    from public.inventory_snapshots s
    join public.data_connections dc on dc.id = s.connection_id
    where dc.seller_id = auth.uid()
      and dc.marketplace = 'wildberries'
      and s.snapshot_time > now() - interval '3 days'
    order by s.connection_id, s.product_id, s.snapshot_time desc
  )
  select
    connection_id,
    count(*) filter (where stock_quantity > 0)::int                   as stocked,
    count(*) filter (where stock_quantity > 0 and price > 0)::int     as stocked_priced
  from latest
  group by connection_id;
$$;

grant execute on function public.wb_price_coverage() to authenticated;
