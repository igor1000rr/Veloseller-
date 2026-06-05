#!/usr/bin/env bash
# Перенос Veloseller из облачного Supabase в self-hosted.
#
# Запускать НА сервере с self-hosted стеком (после setup-selfhosted.sh),
# когда Kong отвечает на http://127.0.0.1:8000.
#
# Использование:
#   CLOUD_DB_URL='postgresql://postgres:ПАРОЛЬ@db.pptetnhdmxehijslbsrx.supabase.co:5432/postgres' \
#     bash migrate-from-cloud.sh /opt/supabase
#
# Пароль облачной БД: dashboard → Settings → Database (можно Reset password).
# Прямой Postgres-порт облака обычно жив даже при Fair-Use restriction
# (зарезаны Data API/Auth, не сам Postgres). Если коннект не идёт — у Supabase
# в dashboard есть Backups: скачать дамп руками и подать в этот скрипт через
# DUMP_FILE=/path/to/dump.
#
# Что переносится:
#   1. Схема + данные public (таблицы, RPC, RLS-политики, триггеры, индексы)
#   2. Пользователи auth (users + identities — хэши паролей сохраняются,
#      сессии не переносим: один раз перелогиниться)
#   3. Bucket'ы storage (метаданные; файлы отчётов-архива не тащим — они
#      продублированы на почту/в Telegram получателям)
set -euo pipefail

TARGET="${1:-/opt/supabase}"
LOCAL_ENV="$TARGET/docker/.env"
[ -f "$LOCAL_ENV" ] || { echo "Нет $LOCAL_ENV — сначала setup-selfhosted.sh"; exit 1; }

LOCAL_PG_PASSWORD=$(grep '^POSTGRES_PASSWORD=' "$LOCAL_ENV" | cut -d= -f2-)
LOCAL_DB_URL="postgresql://postgres:${LOCAL_PG_PASSWORD}@127.0.0.1:5432/postgres"
WORKDIR=$(mktemp -d /tmp/veloseller-migrate.XXXXXX)
trap 'rm -rf "$WORKDIR"' EXIT

command -v pg_dump >/dev/null || { echo "Поставь клиент: apt install -y postgresql-client-16"; exit 1; }

# ── 1. Дамп облака ──────────────────────────────────────────────────────────
if [ -n "${DUMP_FILE:-}" ]; then
  echo "==> Использую готовый дамп $DUMP_FILE"
  cp "$DUMP_FILE" "$WORKDIR/public.dump"
else
  : "${CLOUD_DB_URL:?Задай CLOUD_DB_URL (см. шапку скрипта)}"
  echo "==> Дамп схемы и данных public из облака"
  pg_dump "$CLOUD_DB_URL" \
    --schema=public \
    --no-owner --no-privileges \
    -Fc -f "$WORKDIR/public.dump"

  echo "==> Дамп пользователей auth (только данные users/identities)"
  pg_dump "$CLOUD_DB_URL" \
    --data-only --column-inserts \
    -t auth.users -t auth.identities \
    --no-owner --no-privileges \
    -f "$WORKDIR/auth_users.sql"

  echo "==> Дамп bucket'ов storage"
  pg_dump "$CLOUD_DB_URL" \
    --data-only --column-inserts \
    -t storage.buckets \
    --no-owner --no-privileges \
    -f "$WORKDIR/storage_buckets.sql"
fi

# ── 2. Restore public в self-hosted ────────────────────────────────────────
echo "==> Restore public (схема + данные + RLS + RPC)"
pg_restore "$WORKDIR/public.dump" \
  --dbname="$LOCAL_DB_URL" \
  --no-owner --no-privileges \
  --exit-on-error

# PostgREST в self-hosted ходит ролями anon/authenticated/service_role —
# выдаём гранты на восстановленную схему (в облаке это делалось платформой).
echo "==> Гранты для ролей PostgREST"
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
SQL

# ── 3. Пользователи auth ────────────────────────────────────────────────────
if [ -f "$WORKDIR/auth_users.sql" ]; then
  echo "==> Restore auth.users / auth.identities"
  # Версии GoTrue в облаке и self-hosted могут отличаться колонками.
  # --column-inserts даёт INSERT с явными именами: при расхождении psql упадёт
  # на конкретной строке — тогда лечим точечно (юзеров единицы).
  psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f "$WORKDIR/auth_users.sql" || {
    echo '!! restore auth упал (расхождение колонок GoTrue?).'
    echo '!! Файл сохранён, разберём точечно:'
    cp "$WORKDIR/auth_users.sql" /root/auth_users.sql
    exit 1
  }
fi

# ── 4. Storage buckets ──────────────────────────────────────────────────────
if [ -f "$WORKDIR/storage_buckets.sql" ]; then
  echo "==> Restore storage.buckets"
  psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f "$WORKDIR/storage_buckets.sql" || \
    echo '!! buckets не вstaли (возможно уже есть) — проверь: report-files'
fi

# ── 5. Перезапуск PostgREST (перечитать schema cache) ───────────────────────
cd "$TARGET/docker"
docker compose restart rest auth storage >/dev/null

echo
echo "==> Миграция данных завершена. Дальше:"
echo "    1. В env web/worker заменить SUPABASE_URL + ключи (см. veloseller-env-selfhosted.example)"
echo "    2. systemctl restart veloseller-web veloseller-worker"
echo "    3. Проверить: логин на сайте, синк склада, /api/health"
