-- ============================================================================
-- Восстановление триггера on_auth_user_created на auth.users + бэкфилл sellers.
-- Применено на проде 19.06.2026 (через MCP). Здесь — для воспроизводимости
-- на `supabase db reset` / свежем окружении и для переналивки после апгрейдов.
--
-- ПРОБЛЕМА: триггер on_auth_user_created (создаёт ряд public.sellers при
-- регистрации, вызывая handle_new_user) на проде ОТСУТСТВОВАЛ — пропал ~10.06.2026.
-- Новые юзеры заводились в auth.users без ряда в sellers → при создании склада
-- падал внешний ключ data_connections.seller_id → sellers.id (в UI «Не удалось
-- создать склад»). Старые юзеры, у кого ряд sellers уже был, работали штатно.
--
-- ПРИЧИНА (self-hosted Supabase): триггеры на auth.users НЕ попадают в снапшот
-- схемы (supabase db diff покрывает public, не auth), поэтому жили вне миграций
-- и были снесены операцией над auth-схемой (апгрейд/миграция GoTrue). revoke
-- execute из 20260610120000 триггер не дропает — это отдельное событие того дня.
--
-- ВАЖНО: миграция идемпотентна (drop if exists + create; insert по left join is
-- null). ПЕРЕНАКАТЫВАТЬ после каждого апгрейда Supabase/GoTrue — auth-триггеры
-- при этом снова могут пропасть. Функция handle_new_user() здесь не объявляется:
-- она в public-схеме, лежит в снапшоте (20260601180000), апгрейды GoTrue её не
-- трогают.
-- ============================================================================

-- 1. Триггер на auth.users.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Бэкфилл недостающих sellers за период, пока триггер отсутствовал.
--    Триггер trg_create_default_subscriptions на sellers сам создаст дефолтные
--    подписки для добавленных рядов; plan/лимиты заполнятся из DEFAULT-ов колонок
--    (trial / 15 / 10000).
insert into public.sellers (id, email, display_name)
select u.id, u.email, coalesce(u.raw_user_meta_data->>'display_name', u.email)
from auth.users u
left join public.sellers s on s.id = u.id
where s.id is null;
