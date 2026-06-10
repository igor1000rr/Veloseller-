-- ============================================================================
-- Безопасность: hardening EXECUTE-грантов и SECURITY DEFINER у RPC-функций.
-- Применено на проде 10.06.2026 (через MCP). Здесь — для воспроизводимости
-- на `supabase db reset` / свежем окружении (зеркалит реальное состояние прода).
-- ============================================================================

-- HIGH: admin_connection_data_age() — SECURITY DEFINER, без аргументов,
-- возвращала email и операционные данные ВСЕХ продавцов (до 100 строк).
-- До фикса роли anon и authenticated имели EXECUTE → любой с публичным
-- anon-ключом мог выгрузить данные всех клиентов через PostgREST RPC
-- (/rest/v1/rpc/admin_connection_data_age), без логина и в обход RLS.
-- Страница /admin/health вызывает функцию через service_role — доступ сохраняется.
revoke execute on function public.admin_connection_data_age() from anon, authenticated, public;

-- MEDIUM: get_sync_log_history(uuid, integer) — была SECURITY DEFINER и
-- принимала чужой p_seller_id без проверки = auth.uid(), что давало
-- межтенантную утечку метаданных синхронизаций. Переводим на SECURITY INVOKER:
-- теперь RLS сам ограничивает вызывающего его собственными строками
-- (snapshots/products), чужой seller_id вернёт пусто. search_path остаётся 'public'.
alter function public.get_sync_log_history(uuid, integer) security invoker;

-- LOW: переприменяем hardening триггерных функций. Эти revoke были в снапшоте
-- схемы (20260601180000), но на проде фактически не накатились (роли
-- anon/authenticated сохраняли EXECUTE). Прямой эксплуатации нет — функции
-- обращаются к NEW.* и вне триггера падают, — но приводим прод в соответствие
-- документированному hardening.
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.enforce_sku_limit() from anon, authenticated, public;
revoke execute on function public.create_default_notification_subscriptions() from anon, authenticated, public;
