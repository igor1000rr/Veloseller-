-- Журнал действий администратора: смена плана/лимитов, триал, Radar, ресинк и т.п.
-- Таблица уже создана в проде напрямую; миграция добавлена для паритета и идемпотентна.
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_email text not null,
  action text not null,
  target_seller_id uuid references public.sellers(id) on delete set null,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_seller_idx
  on public.admin_audit_log (target_seller_id, created_at desc);
create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc);

-- RLS включён, политик нет — доступ только через service_role (админка).
alter table public.admin_audit_log enable row level security;
