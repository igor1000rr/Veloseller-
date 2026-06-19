-- Журнал действий администраторов (смена плана/триала/лимитов/Radar, сброс пароля).
-- Пишется и читается только service-role из /admin. RLS включён без политик —
-- для anon/authenticated доступ закрыт.
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_email text not null,
  action text not null,
  target_seller_id uuid references public.sellers(id) on delete set null,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_target_idx
  on public.admin_audit_log (target_seller_id, created_at desc);
create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;

comment on table public.admin_audit_log is
  'Журнал действий администраторов. Пишется/читается только service-role из /admin. RLS без политик.';
