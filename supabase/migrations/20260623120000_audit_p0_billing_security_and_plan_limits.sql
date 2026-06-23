-- ============================================================================
-- P0 audit fixes — 2026-06-23
-- Применяется ВРУЧНУЮ на self-hosted prod (как и остальные миграции).
--
-- C1  Привилегированная эскалация тарифа через RLS:
--     политика sellers_self_update имеет WITH CHECK = null, а роли
--     authenticated/anon держат column-UPDATE на биллинговых колонках →
--     любой залогиненный мог self-grant'ить Pro/Radar напрямую через PostgREST.
--     Фикс: отозвать UPDATE у anon/authenticated, выдать authenticated только
--     непривилегированные профиль/настройки. Все биллинговые записи идут через
--     service_role (активация Robokassa, админка, actionStartRadarTrial).
--     ⚠ Применять ПОСЛЕ деплоя billing/actions.ts (radar-trial переведён на
--       service-role), иначе кнопка «активировать Radar Trial» временно падает.
--
-- C2  Лимиты тарифов перетирались БД-механизмами:
--     enforce_sku_limit() игнорировал per-warehouse колонку и кастом-планы
--     (else 50 SKU); update_warehouses_limit_on_plan_change() форсил custom→15
--     и growth→6. Фикс: энфорсмент по plan_sku_per_warehouse_limit ×
--     plan_warehouses_limit (заполняются при активации для всех планов, вкл.
--     Конструктор); триггер больше не трогает custom_* и ставит growth=5.
-- ============================================================================

-- ── C1: lock billing/plan/radar columns from end users ─────────────────────
REVOKE UPDATE ON public.sellers FROM anon, authenticated;
GRANT  UPDATE (display_name, timezone, telegram_chat_id, notify_email, notify_telegram,
               tax_rate, currency, default_lead_time_days, default_safety_days)
       ON public.sellers TO authenticated;
GRANT  UPDATE ON public.sellers TO service_role;  -- keep authoritative (idempotent)

-- ── C2a: per-seller SKU enforcement (covers Конструктор) ───────────────────
CREATE OR REPLACE FUNCTION public.enforce_sku_limit()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare current_count integer; max_allowed integer; per_wh integer; wh integer; seller_plan text;
begin
  select plan, coalesce(plan_sku_per_warehouse_limit,0), coalesce(plan_warehouses_limit,0)
    into seller_plan, per_wh, wh
    from sellers where id = new.seller_id;
  if per_wh > 0 and wh > 0 then
    max_allowed := per_wh * wh;                                      -- per-warehouse SKU × warehouses
  else
    max_allowed := plan_sku_limit(coalesce(seller_plan, 'trial'));  -- legacy fallback
  end if;
  select count(*) into current_count from products where seller_id = new.seller_id;
  if current_count >= max_allowed then
    raise exception 'SKU limit reached: plan allows up to % SKUs (current: %).', max_allowed, current_count
      using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

-- ── C2b: warehouse-limit trigger keeps custom-plan values; growth 6 -> 5 ───
CREATE OR REPLACE FUNCTION public.update_warehouses_limit_on_plan_change()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $function$
begin
  if new.plan is distinct from old.plan then
    new.plan_warehouses_limit := case new.plan
      when 'trial'   then 3
      when 'starter' then 2
      when 'growth'  then 5
      when 'pro'     then 15
      else new.plan_warehouses_limit   -- custom_*/unknown: keep activation-written value
    end;
  end if;
  return new;
end;
$function$;

-- ── C2c: legacy fallback returns sane TOTAL caps (never else=50) ────────────
CREATE OR REPLACE FUNCTION public.plan_sku_limit(p text)
 RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO '' AS $function$
  select case p
    when 'trial'   then 30000
    when 'starter' then 2000
    when 'growth'  then 10000
    when 'pro'     then 150000
    else 30000
  end
$function$;

-- ── L: drop leftover debug table (RLS-enabled-no-policy advisor error) ──────
DROP TABLE IF EXISTS public._wb_cards_debug;
