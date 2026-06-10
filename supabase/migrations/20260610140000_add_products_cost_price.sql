-- Себестоимость товара: массовая загрузка из карточки + (в перспективе) ручной ввод.
-- Per-connection (склад): products уже привязаны к connection_id, поэтому
-- «выбор склада» при импорте ложится естественно.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price numeric,
  ADD COLUMN IF NOT EXISTS cost_price_updated_at timestamp with time zone;

-- Массовое проставление себестоимости по SKU в пределах одного склада.
-- Вызывается воркером (service role) при импорте файла: один UPDATE из jsonb
-- вместо построчных запросов. Возвращает число обновлённых строк (= сопоставлено).
CREATE OR REPLACE FUNCTION public.bulk_update_cost_prices(
  p_seller_id uuid,
  p_connection_id uuid,
  p_costs jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.products p
  SET cost_price = (c.value->>'cost')::numeric,
      cost_price_updated_at = now()
  FROM jsonb_array_elements(p_costs) AS c(value)
  WHERE p.seller_id = p_seller_id
    AND p.connection_id = p_connection_id
    AND p.sku = (c.value->>'sku');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_update_cost_prices(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_update_cost_prices(uuid, uuid, jsonb) TO service_role;
