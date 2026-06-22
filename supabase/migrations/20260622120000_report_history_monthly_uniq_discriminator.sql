-- C1 (аудит 22.06.2026): unique-индекс report_history (seller_id, channel, sent_date)
-- лумпил месячный отчёт с дневным/недельным под channel='email'. На 1-е число их
-- INSERT конфликтовал → audit-строка месячного отчёта не записывалась (ошибка
-- глоталась в _record_monthly_history). Дубль ПИСЕМ при этом исключён отдельно
-- (cron monthly срабатывает раз + исправленный дедуп _already_sent_this_month).
--
-- Добавляем в unique-ключ дискриминатор «это месячный отчёт» (kinds содержит
-- 'monthly_report'): месячные и не-месячные строки за один день больше не
-- конфликтуют, при этом дедуп ВНУТРИ каждого типа (день-vs-день, месяц-vs-месяц)
-- сохранён. Новый ключ строго мягче старого → существующие данные его не нарушают.
--
-- Примечание: на этом self-hosted нет supabase_migrations.schema_migrations,
-- поэтому миграция применена напрямую (execute_sql). Файл — для истории схемы.
drop index if exists public.report_history_seller_channel_date_uniq;
create unique index report_history_seller_channel_date_uniq
  on public.report_history (seller_id, channel, sent_date, ((kinds @> array['monthly_report'::text])));
