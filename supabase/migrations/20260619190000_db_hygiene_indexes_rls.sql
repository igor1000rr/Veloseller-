-- Гигиена БД: дубли индексов, недостающий FK-индекс, RLS на дебаг-таблице.
-- Идемпотентно (IF EXISTS / IF NOT EXISTS): безопасно и на уже применённой .ru
-- (no-op), и на .com — накатит недостающее. Применено на .ru вручную 19.06.2026.

-- 1. Дубли индексов (у каждого остаётся идентичный/покрывающий — потеря нулевая):
drop index if exists public.admin_audit_log_target_idx;            -- = admin_audit_log_seller_idx (target_seller_id, created_at DESC)
drop index if exists public.radar_brands_seller_normalized_uniq;   -- = constraint radar_brands_seller_name_uniq (seller_id, name_normalized)
drop index if exists public.idx_radar_queries_favorite;            -- = idx_radar_queries_seller_favorite (partial is_favorite)
drop index if exists public.idx_radar_query_history_query;         -- покрыт UNIQUE radar_query_history_uniq (query_id, period_year, period_month)

-- 2. FK без покрывающего индекса (ускоряет каскады/джоины по query_id):
create index if not exists idx_radar_actions_query on public.radar_actions (query_id);

-- 3. Дебаг-таблица дампа WB-карточек не должна торчать через PostgREST.
--    Доступ остаётся только под service_role (worker), RLS его не касается.
alter table public._wb_cards_debug enable row level security;
