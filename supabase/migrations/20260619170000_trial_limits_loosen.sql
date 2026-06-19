-- Триал: послабление лимитов.
-- 1) Общий потолок SKU триала 50 → 10000 (как у pro — верхняя планка; триал даёт
--    весь функционал на 30 дней). Действует сразу на всех trial-селлеров через
--    триггер enforce_sku_limit (он читает plan_sku_limit вживую).
-- 2) Склады триала 15 → 3: дефолт колонки sellers.plan_warehouses_limit + триггер
--    смены тарифа. Существующие trial-селлеры сохраняют текущий лимит (не клампим,
--    чтобы не отрезать уже добавленные склады) — новые получают 3.

create or replace function public.plan_sku_limit(p text)
returns integer language sql immutable as $$
  select case p when 'trial' then 10000 when 'starter' then 500 when 'growth' then 4000 when 'pro' then 10000 else 50 end
$$;

create or replace function public.update_warehouses_limit_on_plan_change()
returns trigger language plpgsql as $$
begin
  if new.plan is distinct from old.plan then
    new.plan_warehouses_limit := case new.plan
      when 'trial'    then 3
      when 'starter'  then 2
      when 'growth'   then 6
      when 'pro'      then 15
      else 15
    end;
  end if;
  return new;
end;
$$;

alter table public.sellers alter column plan_warehouses_limit set default 3;
