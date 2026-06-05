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
# (зарезаны Data API/Auth, не сам Postgres). Если коннект не идёт — задай
# DUMP_FILE=/path/to/public.dump (custom-формат pg_dump схемы public).
#
# Все pg_dump/pg_restore/psql выполняются ВНУТРИ контейнера supabase-db:
#   - версии клиентов совпадают с сервером по построению (PG 17.6 = облако),
#   - на хост не нужно ставить postgresql-client,
#   - restore идёт по unix-socket'у под postgres, минуя supavisor и его
#     tenant-формат имён пользователей.
#
# Что переносится:
#   1. Схема + данные public (таблицы, RPC, RLS-политики, триггеры, индексы)
#   2. Пользователи auth (users + identities — хэши паролей сохраняются,
#      сессии не переносим: один раз перелогиниться)
#   3. Bucket'ы storage (метаданные; файлы отчётов-архива не тащим — они
#      продублированы на почту/в Telegram получателям)
set -euo pipefail

TARGET="${1:-/opt/supabase}"
DB=supabase-db
TMP=/tmp/veloseller-migrate

[ -f "$TARGET/docker/.env" ] || { echo "Нет $TARGET/docker/.env — сначала setup-selfhosted.sh"; exit 1; }
docker exec "$DB" true 2>/dev/null || { echo "Контейнер $DB не запущен"; exit 1; }

dexec() { docker exec "$DB" "$@"; }
dpsql() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }

dexec mkdir -p "$TMP"
cleanup() { dexec rm -rf "$TMP" || true; }
trap cleanup EXIT

# ── 1. Дамп облака (изнутри контейнера: pg_dump 17 ↔ облако 17.6) ───────────
if [ -n "${DUMP_FILE:-}" ]; then
  echo "==> Использую готовый дамп $DUMP_FILE"
  docker cp "$DUMP_FILE" "$DB:$TMP/public.dump"
else
  : "${CLOUD_DB_URL:?Задай CLOUD_DB_URL (см. шапку скрипта)}"
  echo "==> Дамп схемы и данных public из облака"
  dexec pg_dump "$CLOUD_DB_URL" \
    --schema=public \
    --no-owner --no-privileges \
    -Fc -f "$TMP/public.dump"

  echo "==> Дамп пользователей auth (только данные users/identities)"
  dexec pg_dump "$CLOUD_DB_URL" \
    --data-only --column-inserts \
    -t auth.users -t auth.identities \
    --no-owner --no-privileges \
    -f "$TMP/auth_users.sql"

  echo "==> Дамп bucket'ов storage"
  dexec pg_dump "$CLOUD_DB_URL" \
    --data-only --column-inserts \
    -t storage.buckets \
    --no-owner --no-privileges \
    -f "$TMP/storage_buckets.sql"
fi

# ── 2. Restore public в self-hosted ────────────────────────────────────────
echo "==> Restore public (схема + данные + RLS + RPC)"
dexec pg_restore \
  --username postgres --dbname postgres \
  --no-owner --no-privileges \
  --exit-on-error \
  "$TMP/public.dump"

# PostgREST в self-hosted ходит ролями anon/authenticated/service_role —
# выдаём гранты на восстановленную схему (в облаке это делалось платформой).
echo "==> Гранты для ролей PostgREST"
dpsql <<'SQL'
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
SQL

# ── 3. Пользователи auth ────────────────────────────────────────────────────
if dexec test -f "$TMP/auth_users.sql"; then
  echo "==> Restore auth.users / auth.identities"
  # Версии GoTrue в облаке и self-hosted могут отличаться колонками.
  # --column-inserts даёт INSERT с явными именами: при расхождении psql упадёт
  # на конкретной строке — тогда лечим точечно (юзеров единицы).
  dpsql -f "$TMP/auth_users.sql" || {
    echo '!! restore auth упал (расхождение колонок GoTrue?).'
    echo '!! Файл сохранён в /root/auth_users.sql — разберём точечно.'
    docker cp "$DB:$TMP/auth_users.sql" /root/auth_users.sql
    exit 1
  }
fi

# ── 4. Storage buckets ──────────────────────────────────────────────────────
if dexec test -f "$TMP/storage_buckets.sql"; then
  echo "==> Restore storage.buckets"
  dpsql -f "$TMP/storage_buckets.sql" || \
    echo '!! buckets не встали (возможно уже есть) — проверь наличие report-files'
fi

# ── 5. Перезапуск PostgREST/Auth/Storage (перечитать schema cache) ──────────
cd "$TARGET/docker"
docker compose restart rest auth storage >/dev/null

echo
echo "==> Миграция данных завершена. Дальше:"
echo "    1. В env web/worker заменить SUPABASE_URL + ключи (см. veloseller-env-selfhosted.example)"
echo "    2. systemctl restart veloseller-web veloseller-worker"
echo "    3. Проверить: логин на сайте, синк склада, /api/health"
