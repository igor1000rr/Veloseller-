#!/bin/bash
# Veloseller — финальный этап деплоя.
# Запускается ПОСЛЕ setup-server.sh, когда уже созданы .env.production и .env.
# Делает build web + запускает сервисы + выдаёт SSL.
set -euo pipefail

DOMAIN="${1:-veloseller.com}"
DEPLOY_DIR="/opt/veloseller"
DEPLOY_USER="veloseller"

if [ ! -f "$DEPLOY_DIR/apps/web/.env.production" ]; then
  echo "❌ Нет $DEPLOY_DIR/apps/web/.env.production — создай из deploy/env.web.example"
  exit 1
fi
if [ ! -f "$DEPLOY_DIR/apps/worker/.env" ]; then
  echo "❌ Нет $DEPLOY_DIR/apps/worker/.env — создай из deploy/env.worker.example"
  exit 1
fi

echo "==> npm run build (Next.js, production)"
cd "$DEPLOY_DIR/apps/web"
sudo -u "$DEPLOY_USER" npm run build

echo "==> Старт systemd сервисов"
systemctl enable veloseller-worker veloseller-web
systemctl restart veloseller-worker
sleep 2
systemctl restart veloseller-web
sleep 2

echo "==> Статус сервисов:"
systemctl status veloseller-worker --no-pager -l | head -10
systemctl status veloseller-web --no-pager -l | head -10

echo "==> SSL через Let's Encrypt (если домен уже указывает на IP)"
if [ "$DOMAIN" != "veloseller.com" ] || dig +short "$DOMAIN" | grep -q .; then
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "admin@$DOMAIN" || \
    echo "⚠️ SSL не выдан (проверь DNS), можно позже: certbot --nginx -d $DOMAIN"
else
  echo "⚠️ Пропущен SSL — DNS не настроен. Позже: certbot --nginx -d $DOMAIN"
fi

echo
echo "✅ Deploy работает."
echo "   Web:    http://$DOMAIN/"
echo "   Worker: внутренний localhost:8001 (через nginx или из web)"
echo "   logs:   journalctl -u veloseller-web -f"
echo "           journalctl -u veloseller-worker -f"
