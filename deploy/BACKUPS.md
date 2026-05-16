# Veloseller — бэкапы

## Что резервируется

PostgreSQL Supabase (вся public schema): sellers, products, snapshots, events,
tvelo_metrics, store_metrics, alerts, changelog, data_connections, price_elasticity.

**Не** резервируется Supabase auth.* (это делает сам сервис на platform-уровне).

## Схема хранения

- **Daily**: VPS `/var/backups/veloseller/*.sql.gz`, 14 дней
- **Supabase platform backup**: включён в Pro-плане (PITR 7 дней). Для free plan — только наш скрипт

## Настройка на VPS (один раз)

```bash
# 1. Установка pg_dump (версия должна совпадать или быть новее сервера)
sudo apt install -y postgresql-client-16

# 2. Создание env-файла
sudo mkdir -p /etc/veloseller
sudo tee /etc/veloseller/backup.env > /dev/null <<'EOF'
DATABASE_URL=postgresql://postgres.PROJECT_ID:PASSWORD@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
# Optional: healthcheck ping
# HEALTHCHECK_URL=https://hc-ping.com/your-uuid
EOF
sudo chmod 600 /etc/veloseller/backup.env

# 3. Создание backup-директории
sudo mkdir -p /var/backups/veloseller
sudo chown veloseller:veloseller /var/backups/veloseller

# 4. Ручной тестовый запуск
sudo -u veloseller bash /opt/veloseller/deploy/backup-supabase.sh

# 5. Добавление в crontab
sudo crontab -u veloseller -e
# Добавь строку:
# 0 3 * * * /opt/veloseller/deploy/backup-supabase.sh >> /var/log/veloseller-backup.log 2>&1
```

## Restore

```bash
# Распаковать
gunzip -c /var/backups/veloseller/veloseller-20260515-030000.sql.gz > /tmp/dump.sql

# Восстановить в новый Supabase проект:
psql "$DATABASE_URL_TARGET" < /tmp/dump.sql
```

**ВНИМАНИЕ**: restore в production базу перезапишет все существующие данные. Сначала в staging!

## Monitoring

Два варианта проверки что бэкапы идут:

1. **Healthchecks.io** (бесплатно до 20 чеков): создай check, положи ping URL в backup.env как `HEALTHCHECK_URL=...`. Если бэкап не работает больше дня — прилетит email или Telegram.
2. **Локальный лог**: `tail /var/log/veloseller-backup.log` или `journalctl -t veloseller-backup`.
