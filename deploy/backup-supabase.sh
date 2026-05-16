#!/bin/bash
# Скрипт резервного копирования Supabase PostgreSQL.
# Запускать через cron на VPS или вручную.
#
# Cron пример (ежедневно в 3:00 UTC):
#   0 3 * * * /opt/veloseller/deploy/backup-supabase.sh >> /var/log/veloseller-backup.log 2>&1
#
# Требует:
#   - pg_dump (apt install postgresql-client-16)
#   - DATABASE_URL в /etc/veloseller/backup.env
#   - Настроенные права записи в BACKUP_DIR

set -euo pipefail

# === Конфиг ===
BACKUP_DIR="${BACKUP_DIR:-/var/backups/veloseller}"
KEEP_DAYS="${KEEP_DAYS:-14}"
ENV_FILE="${ENV_FILE:-/etc/veloseller/backup.env}"

# Загружаем DATABASE_URL
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[$(date -Iseconds)] ERROR: DATABASE_URL not set (check $ENV_FILE)" >&2
  exit 1
fi

# === Подготовка ===
mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
DUMP_FILE="$BACKUP_DIR/veloseller-${TIMESTAMP}.sql.gz"

echo "[$(date -Iseconds)] Starting backup to $DUMP_FILE"

# === Дамп с компрессией ===
# --no-owner --no-privileges — без OWNER/GRANT команд (проще restore на другой инстанс)
# -Z 6 — средний уровень сжатия
pg_dump "$DATABASE_URL" \
  --no-owner \
  --no-privileges \
  --format=plain \
  --schema=public \
  | gzip -6 > "$DUMP_FILE"

SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "[$(date -Iseconds)] Backup complete: $DUMP_FILE ($SIZE)"

# === Очистка старых ===
find "$BACKUP_DIR" -maxdepth 1 -name 'veloseller-*.sql.gz' -mtime "+$KEEP_DAYS" -delete
echo "[$(date -Iseconds)] Pruned backups older than $KEEP_DAYS days"

# === Health check (опционально) ===
# Если вы используете healthchecks.io или свой monitoring:
if [ -n "${HEALTHCHECK_URL:-}" ]; then
  curl -fsS --retry 3 -m 10 "$HEALTHCHECK_URL" > /dev/null && \
    echo "[$(date -Iseconds)] Pinged healthcheck"
fi

echo "[$(date -Iseconds)] Done."
