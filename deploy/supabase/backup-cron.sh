#!/usr/bin/env bash
# Ежедневный бэкап self-hosted Supabase (на Free-облаке бэкапов не было вовсе,
# теперь они наша ответственность). Кладёт в /var/backups/supabase, хранит 14 шт.
#
# Дамп выполняется внутри контейнера supabase-db (unix-socket, клиент = сервер
# по версии), наружу — через stdout: на хосте postgresql-client не нужен.
#
# Установка: cp backup-cron.sh /usr/local/bin/supabase-backup && chmod +x /usr/local/bin/supabase-backup
#   echo '20 3 * * * root /usr/local/bin/supabase-backup' > /etc/cron.d/supabase-backup
set -euo pipefail

TARGET="${TARGET:-/opt/supabase}"
OUT=/var/backups/supabase
KEEP=14

mkdir -p "$OUT"
STAMP=$(date +%F)

# Полный дамп всего кластера (public + auth + storage метаданные)
docker exec supabase-db pg_dump -U postgres -d postgres -Fc > "$OUT/veloseller-$STAMP.dump"

# Файлы storage (отчёты)
tar -czf "$OUT/storage-$STAMP.tar.gz" -C "$TARGET/docker/volumes" storage 2>/dev/null || true

# Ротация
ls -1t "$OUT"/veloseller-*.dump 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -f
ls -1t "$OUT"/storage-*.tar.gz 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -f

echo "backup ok: $OUT/veloseller-$STAMP.dump"
