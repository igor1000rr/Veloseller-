-- Правки 10: доп. поля карточки и снапшота.
-- #3 — цена продавца (seller_price) и фактическая цена со скидкой маркетплейса
--      (marketing_price): две линии на графике цены.
-- #5 — комиссия маркетплейса в % (commission_pct): дефолт для юнит-экономики.
-- #6 — бренд и категория товара: основа для тегов и фильтрации.
--
-- Применено вживую через MCP 2026-06-09 на self-hosted (185.221.215.215).
-- Этот файл — для чистых деплоев и пере-провижининга. Идемпотентно (IF NOT EXISTS).

alter table public.inventory_snapshots
  add column if not exists seller_price numeric,
  add column if not exists marketing_price numeric,
  add column if not exists commission_pct numeric;

alter table public.products
  add column if not exists brand text,
  add column if not exists category text;
