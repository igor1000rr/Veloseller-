-- error_since: момент начала текущего непрерывного эпизода ошибок синка склада.
--
-- Зачем: транзиентные ошибки (429-лимит WB Statistics, 5xx, сеть) после фикса
-- 24.06.2026 НЕ паузят склад — он остаётся в 'error' и ретраится сам. Чтобы при
-- этом не спамить юзера, пер-фейл уведомления по транзиенту подавлены. Но если
-- эпизод тянется долго (>6ч), стоит прислать ОДНО уведомление. last_sync_at для
-- измерения длительности не годится — он обновляется на КАЖДОЙ попытке (в т.ч.
-- неуспешной). Поэтому отдельный маркер старта эпизода.
--
-- Ставится воркером при переходе active→error (failure_count 0→1), очищается при
-- успешном синке. См. app/ingest_persist.py::_mark_connection_synced.

alter table public.data_connections
  add column if not exists error_since timestamptz;

comment on column public.data_connections.error_since is
  'Начало текущего непрерывного эпизода ошибок синка (timestamptz). Ставится при active→error (failure_count 0→1), очищается при успехе. Для одноразового уведомления о затяжной транзиентной ошибке (>6ч).';

-- Бэкфилл уже висящих в ошибке/паузе складов: консервативно — от последней
-- попытки (last_sync_at). Точного старта эпизода для старых строк нет; это не даёт
-- ложно-древних значений и преждевременных уведомлений.
update public.data_connections
  set error_since = last_sync_at
  where status in ('error', 'paused')
    and error_since is null
    and last_sync_at is not null;
