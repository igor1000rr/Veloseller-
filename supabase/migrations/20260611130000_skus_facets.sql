-- Правки 12 (#3): значения для выпадающих фильтров таблицы SKU.
-- distinct бренды, категории и теги селлера (опционально в разрезе склада)
-- одним RPC — под выпадашки «Бренд / Категория / Тег». Бережём egress
-- (не вытягиваем все строки products на каждую загрузку списка).
--
-- SECURITY INVOKER: RLS таблицы products сам ограничивает вызывающего его
-- строками (как get_sync_log_history после hardening 10.06) — чужой
-- p_seller_id вернёт пусто. EXECUTE отозван у anon/public, выдан authenticated.
--
-- Применено вживую через MCP (execute_sql) 2026-06-11 на self-hosted .ru
-- (185.221.215.215). Этот файл — для чистых деплоев и .com. Идемпотентно.
create or replace function public.get_skus_facets(
  p_seller_id uuid,
  p_connection_id uuid default null
)
returns table (brands text[], categories text[], tags text[])
language sql
security invoker
set search_path = public
as $$
  with scoped as (
    select brand, category, tags
    from public.products
    where seller_id = p_seller_id
      and (p_connection_id is null or connection_id = p_connection_id)
  )
  select
    coalesce(
      (select array_agg(distinct brand order by brand)
         from scoped where brand is not null and brand <> ''),
      array[]::text[]
    ) as brands,
    coalesce(
      (select array_agg(distinct category order by category)
         from scoped where category is not null and category <> ''),
      array[]::text[]
    ) as categories,
    coalesce(
      (select array_agg(distinct tg order by tg)
         from (select unnest(tags) as tg from scoped) u
        where tg is not null and tg <> ''),
      array[]::text[]
    ) as tags;
$$;

revoke execute on function public.get_skus_facets(uuid, uuid) from anon, public;
grant execute on function public.get_skus_facets(uuid, uuid) to authenticated, service_role;
