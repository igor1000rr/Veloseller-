-- Recalc jobs lock functions — документируем в git то что уже в проде.
--
-- Эти 4 функции были созданы миграцией add_recalc_jobs_table_and_lock_functions
-- (20260520194448), но не попали в git-папку. Без них worker'ные RPC вызовы
-- (в apps/worker/app/main.py) не работают локально (supabase db reset и т.п.).
--
-- Все функции CREATE OR REPLACE — безопасно прокатывать на проде.

-- ============================================================================
-- try_acquire_recalc_lock: атомарный try-lock с stale-handling.
--
-- Поведение:
--   Ранее не было записи     → INSERT и выдаём лок (true)
--   status в ('done', 'error')      → UPDATE в 'running' и выдаём лок (true)
--   status='running' + stale (>1ч) → UPDATE (перехват) и выдаём лок (true)
--   status='running' и свежий    → НИЧЕГО не делаем, false
--
-- Одна транзакция — нет race condition между check-then-set.
-- ============================================================================
create or replace function public.try_acquire_recalc_lock(
  p_seller_id uuid,
  p_worker_id text default null,
  p_stale_after interval default '01:00:00'::interval
)
returns boolean
language plpgsql
set search_path to ''
as $$
declare
  v_acquired boolean := false;
begin
  insert into public.recalc_jobs (
    seller_id, status, started_at, worker_id,
    finished_at, result, error_text, progress
  )
  values (
    p_seller_id, 'running', pg_catalog.now(), p_worker_id,
    null, null, null, null
  )
  on conflict (seller_id) do update
    set status = 'running',
        started_at = pg_catalog.now(),
        finished_at = null,
        result = null,
        error_text = null,
        progress = null,
        worker_id = excluded.worker_id
    where public.recalc_jobs.status in ('done', 'error')
       or public.recalc_jobs.started_at < pg_catalog.now() - p_stale_after
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end;
$$;

-- ============================================================================
-- mark_recalc_done: фиксирует успешное завершение пересчёта
-- ============================================================================
create or replace function public.mark_recalc_done(
  p_seller_id uuid,
  p_result jsonb
)
returns void
language plpgsql
set search_path to ''
as $$
begin
  update public.recalc_jobs
  set status = 'done',
      finished_at = pg_catalog.now(),
      result = p_result
  where seller_id = p_seller_id;
end;
$$;

-- ============================================================================
-- mark_recalc_error: фиксирует ошибку пересчёта. Обрезает текст до 500 символов.
-- ============================================================================
create or replace function public.mark_recalc_error(
  p_seller_id uuid,
  p_error_text text
)
returns void
language plpgsql
set search_path to ''
as $$
begin
  update public.recalc_jobs
  set status = 'error',
      finished_at = pg_catalog.now(),
      error_text = pg_catalog.left(p_error_text, 500)
  where seller_id = p_seller_id;
end;
$$;

-- ============================================================================
-- update_recalc_progress: обновляет progress только если job всё ещё running
-- ============================================================================
create or replace function public.update_recalc_progress(
  p_seller_id uuid,
  p_progress jsonb
)
returns void
language plpgsql
set search_path to ''
as $$
begin
  update public.recalc_jobs
  set progress = p_progress
  where seller_id = p_seller_id and status = 'running';
end;
$$;
