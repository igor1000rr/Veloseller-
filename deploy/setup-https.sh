#!/bin/bash
# Настройка HTTPS для veloseller.ru через Let's Encrypt.
#
# Запускать на VPS под root после того как:
#   1. Домен veloseller.ru указывает A-записью на 185.221.215.215
#   2. Старый nginx-secure.conf уже работает на 80 порту
#
# Что делает:
#   - Устанавливает certbot
#   - Получает SSL сертификат для veloseller.ru + www.veloseller.ru
#   - Подменяет nginx config на HTTPS-версию
#   - Перезапускает nginx
#   - Настраивает auto-renewal (certbot.timer уже включён по дефолту)

set -euo pipefail

DOMAIN="veloseller.ru"
WWW_DOMAIN="www.veloseller.ru"
EMAIL="igor1000rr@gmail.com"
REPO_DIR="${REPO_DIR:-/opt/veloseller}"

log() { echo "[$(date -Iseconds)] $*"; }

if [ "$EUID" -ne 0 ]; then
  echo "ERROR: запускать от root (sudo bash $0)" >&2
  exit 1
fi

log "== Шаг 1: установка certbot =="
apt-get update -qq
apt-get install -y certbot python3-certbot-nginx

log "== Шаг 2: проверка DNS =="
RESOLVED=$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || echo "")
if [ -z "$RESOLVED" ]; then
  echo "ERROR: DNS для $DOMAIN не разрешается. Подожди распространение DNS." >&2
  exit 1
fi
log "$DOMAIN → $RESOLVED"

log "== Шаг 3: подготовка директории для ACME challenge =="
mkdir -p /var/www/certbot
chown -R www-data:www-data /var/www/certbot

log "== Шаг 4: получение SSL-сертификата (webroot mode) =="
# Используем nginx-плагин — certbot сам временно модифицирует config,
# получит сертификат, восстановит исходный. Удобнее чем webroot.
certbot --nginx \
  -d "$DOMAIN" -d "$WWW_DOMAIN" \
  --non-interactive --agree-tos \
  -m "$EMAIL" \
  --redirect

log "== Шаг 5: подмена nginx-config на HTTPS-версию из репо =="
cp "$REPO_DIR/deploy/nginx-secure.conf" /etc/nginx/sites-available/veloseller
ln -sf /etc/nginx/sites-available/veloseller /etc/nginx/sites-enabled/veloseller
# Удаляем default если есть
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

log "== Шаг 6: проверка auto-renewal =="
systemctl enable certbot.timer
systemctl start certbot.timer
systemctl status certbot.timer --no-pager | head -5

log "== Шаг 7: проверка HTTPS =="
sleep 2
curl -sI "https://$DOMAIN/" | head -3 || echo "WARN: HTTPS check failed — проверь вручную"

log "== Готово! =="
log "Открой https://$DOMAIN/ в браузере"
log "Тест SSL: https://www.ssllabs.com/ssltest/analyze.html?d=$DOMAIN"
