-- Migration 0006: дополнительные индексы для production-производительности.
--
-- Базовые индексы были в 0001_init.sql. Здесь добавляем то, что позволяет
-- выбирать по основным фильтрам из dashboard/admin/cron:
--   1. tvelo_metrics(seller_id, period_end) — «последний расчёт по селлеру»
--      (сейчас требует join через products)
--   2. tvelo_metrics(period_end DESC) — sorts
--   3. data_connections(seller_id, status) — active connections по селлеру
--   4. data_connections(status, last_sync_at) — scheduler ищет что синхронизировать
--   5. alerts(seller_id, kind) — фильтрация по типу алерта
--   6. tvelo_metrics(product_id, period_end DESC) — история по SKU
--   7. changelog(event_type) — фильтр «только события stockout/recount»
--   8. sellers(plan, trial_ends_at) — admin дашборд и cron смены плана
--   9. products в sellers — основной join (уже есть idx_products_seller)
--   10. inventory_snapshots(connection_id, snapshot_time) — «последний sync»
--
-- ============================================================================
-- tvelo_metrics
-- ============================================================================

-- Поиск последних метрик по SKU (дашборд «история SKU»)
create index if not exists idx_tvelo_product_period_desc
  on tvelo_metrics(product_id, period_end desc);

-- Сортировка по period_end DESC без фильтра (admin global view)
create index if not exists idx_tvelo_period_end_desc
  on tvelo_metrics(period_end desc);

-- ============================================================================
-- data_connections
-- ============================================================================

-- Поиск активных подключений (cron scheduler)
create index if not exists idx_data_connections_status_sync
  on data_connections(status, last_sync_at) where status = 'active';

-- Active connections по селлеру (dashboard блок «Подключенные источники»)
create index if not exists idx_data_connections_seller_status
  on data_connections(seller_id, status);

-- ============================================================================
-- alerts
-- ============================================================================

-- Фильтр «все critical_stock по селлеру» (dashboard alerts page)
create index if not exists idx_alerts_seller_kind
  on alerts(seller_id, kind);

-- ============================================================================
-- changelog
-- ============================================================================

-- Фильтр «покажи только stockout/recount события»
create index if not exists idx_changelog_seller_event_type
  on changelog(seller_id, event_type);

-- ============================================================================
-- sellers (admin queries)
-- ============================================================================

-- Admin: «все селлеры на плане X» и «триалы истекают в этот месяц»
create index if not exists idx_sellers_plan on sellers(plan);
create index if not exists idx_sellers_trial_ends on sellers(trial_ends_at) where plan = 'trial';

-- ============================================================================
-- inventory_snapshots
-- ============================================================================

-- История синхронизаций по подключению (debug, last_sync_at refresh)
create index if not exists idx_snapshots_connection_time
  on inventory_snapshots(connection_id, snapshot_time desc)
  where connection_id is not null;

-- ============================================================================
-- ANALYZE — обновить статистику планировщику запросов
-- ============================================================================

analyze tvelo_metrics;
analyze data_connections;
analyze alerts;
analyze changelog;
analyze sellers;
analyze inventory_snapshots;
