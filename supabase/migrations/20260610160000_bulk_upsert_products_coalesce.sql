-- Защита brand/category от затирания NULL при upsert товаров.
-- Источник на конкретном синке может не отдать brand/category (напр. у OZON FBS
-- ключа нет доступа к дереву категорий, или Content API WB вернул карточку без
-- бренда) — обычный upsert перезаписал бы существующее значение в NULL.
-- bulk_upsert_products через COALESCE сохраняет последнее известное значение,
-- если новое пустое. product_name обновляется всегда (на синке он = имя или SKU).
-- SECURITY INVOKER + EXECUTE только service_role (воркер ходит под ним).

CREATE OR REPLACE FUNCTION public.bulk_upsert_products(p_rows jsonb)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  INSERT INTO public.products (seller_id, connection_id, sku, product_name, brand, category)
  SELECT
    (r->>'seller_id')::uuid,
    (r->>'connection_id')::uuid,
    r->>'sku',
    r->>'product_name',
    NULLIF(r->>'brand', ''),
    NULLIF(r->>'category', '')
  FROM jsonb_array_elements(p_rows) AS r
  ON CONFLICT (seller_id, connection_id, sku) DO UPDATE SET
    product_name = EXCLUDED.product_name,
    brand = COALESCE(EXCLUDED.brand, public.products.brand),
    category = COALESCE(EXCLUDED.category, public.products.category),
    updated_at = now();
$$;

REVOKE EXECUTE ON FUNCTION public.bulk_upsert_products(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bulk_upsert_products(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bulk_upsert_products(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_upsert_products(jsonb) TO service_role;
