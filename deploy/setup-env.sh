#!/bin/bash
# Veloseller — генератор .env файлов с автогенерацией секретов
# Запускается под root.
set -euo pipefail

DEPLOY_DIR="/opt/veloseller"
WEB_ENV="$DEPLOY_DIR/apps/web/.env.production"
WORKER_ENV="$DEPLOY_DIR/apps/worker/.env"

if [ -f "$WEB_ENV" ] || [ -f "$WORKER_ENV" ]; then
  echo "❌ Один из .env уже существует. Удали их вручную если хочешь пересоздать:"
  echo "    rm $WEB_ENV $WORKER_ENV"
  exit 1
fi

# Генерируем общие секреты (одно значение в оба файла)
WORKER_SECRET=$(openssl rand -base64 32 | tr -d '=+/' | head -c 40)
ENCRYPTION_KEY=$(openssl rand -base64 32)
WEBHOOK_SECRET=$(openssl rand -base64 32 | tr -d '=+/' | head -c 40)

echo "✨ Сгенерировано:"
echo "   WORKER_SECRET=$WORKER_SECRET"
echo "   SECRET_ENCRYPTION_KEY=$ENCRYPTION_KEY"
echo "   TELEGRAM_WEBHOOK_SECRET=$WEBHOOK_SECRET"
echo

cat > "$WEB_ENV" << ENVEOF
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://pptetnhdmxehijslbsrx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=__ВСТАВИТЬ__из_Supabase_Settings_API__
SUPABASE_SERVICE_ROLE_KEY=__ВСТАВИТЬ__service_role_key_из_Supabase__

# Worker (на этом же сервере)
WORKER_URL=http://127.0.0.1:8001
WORKER_SECRET=$WORKER_SECRET

# Encryption (тот же что в worker)
SECRET_ENCRYPTION_KEY=$ENCRYPTION_KEY

# Resend email (опционально)
RESEND_API_KEY=
RESEND_FROM_EMAIL=Veloseller <noreply@veloseller.com>

# Admin emails
ADMIN_EMAILS=igor1000rr@gmail.com
ENVEOF

cat > "$WORKER_ENV" << ENVEOF
# Прод-режим: включает fail-fast проверку критичных env в app/config.py
ENV=production

# Supabase (service role, без RLS). ИМЯ важно: worker читает
# SUPABASE_SERVICE_ROLE_KEY (раньше тут было SUPABASE_SERVICE_KEY — worker его
# игнорировал и падал на первом DB-запросе).
SUPABASE_URL=https://pptetnhdmxehijslbsrx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=__ВСТАВИТЬ__service_role_key_из_Supabase__

# Auth между web и worker
WORKER_SECRET=$WORKER_SECRET

# Encryption (тот же что в web)
SECRET_ENCRYPTION_KEY=$ENCRYPTION_KEY

# Верификация Telegram webhook (БАГ 52) — без неё worker не стартует в проде
TELEGRAM_WEBHOOK_SECRET=$WEBHOOK_SECRET

# Telegram bot (опционально — можно оставить пустым)
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=

# Email (опционально)
RESEND_API_KEY=
RESEND_FROM_EMAIL=Veloseller <noreply@veloseller.com>

# Scheduler
SCHEDULER_TIMEZONE=Europe/Warsaw
ENVEOF

chown veloseller:veloseller "$WEB_ENV" "$WORKER_ENV"
chmod 600 "$WEB_ENV" "$WORKER_ENV"

echo "✅ Созданы $WEB_ENV и $WORKER_ENV"
echo
echo "ТЕПЕРЬ ОТРЕДАКТИРУЙ ОБА — подставь Supabase ключи (anon + service_role):"
echo "   https://supabase.com/dashboard/project/pptetnhdmxehijslbsrx/settings/api"
echo
echo "Команды:"
echo "   nano $WEB_ENV"
echo "   nano $WORKER_ENV"
echo
echo "Stripe / Telegram / Resend ключи можно пока оставить пустыми — сайт запустится."
