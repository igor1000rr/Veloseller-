-- warehouse_kind += csv, manual
--
-- Источники «без интеграций» под новую концепцию (расчёт по движению остатков,
-- оценка всех каналов продаж без API маркетплейсов):
--   • csv    — загрузка остатков/цен CSV-файлом из любой системы учёта/Excel/1С;
--   • manual — ручной ввод и корректировки (продажи/пополнения) прямо в кабинете.
--
-- source_type уже содержит 'csv_upload' и 'manual' (см. remote_schema_snapshot).
-- Здесь добавляем соответствующие warehouse_kind, т.к. data_connections.warehouse_kind
-- объявлен NOT NULL и каждый склад обязан иметь тип. Оба источника — не-маркетплейс,
-- поэтому marketplace остаётся NULL.
--
-- Идемпотентно: ADD VALUE IF NOT EXISTS (PostgreSQL 12+). ALTER TYPE ... ADD VALUE
-- нельзя выполнять внутри транзакционного блока — оставляем отдельными стейтментами.
alter type public.warehouse_kind add value if not exists 'csv';
alter type public.warehouse_kind add value if not exists 'manual';
