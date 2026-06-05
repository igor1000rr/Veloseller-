#!/usr/bin/env bash
# Ежедневный бэкап self-hosted Supabase (на Free-облаке бэкапов не было вовсе,
# теперь они наша ответственность). Кладёт в /var/backups/supabase, хранит 14 шт.
#
# Установка: cp backup-cron.sh /usr/local/bin/supabase-backup && chmod +x ... 
#   echo '20 3 * * * root /usr/local/bin/supabase-backup' > /etc/cron.d/supabase-backup
set -euo pipefail

TARGET="${TARGET:-/opt/supabase}"
OUT=/var/backups/supabase
KEEP=14

mkdir -p "$OUT"
PG_PASSWORD=$(grep '^POSTGRES_PASSWORD=' "$TARGET/docker/.env" | cut -d= -f2-)
STAMP=$(date +%F)

# Полный дамп всего кластера (public + auth + storage метаданные)
PGPASSWORD="$PG_PASSWORD" pg_dump -h 127.0.0.1 -p 5432 -U postgres -d postgres \
  -Fc -f "$OUT/veloseller-$STAMP.dump"

# Файлы storage (отчёты)
tar -czf "$OUT/storage-$STAMP.tar.gz" -C "$TARGET/docker/volumes" storage 2>/dev/null || true

# Ротация
ls -1t "$OUT"/veloseller-*.dump 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -f
ls -1t "$OUT"/storage-*.tar.gz 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -f

echo "backup ok: $OUT/veloseller-$STAMP.dump"
