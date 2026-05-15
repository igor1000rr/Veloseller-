#!/bin/bash
#
# Veloseller — бутстрап сервера (Ubuntu 22.04 / 24.04).
# Запускается ОДИН раз под root.
#
set -euo pipefail

DOMAIN="${1:-_}"
REPO="${2:-https://github.com/igor1000rr/Veloseller-.git}"
DEPLOY_USER="veloseller"
DEPLOY_DIR="/opt/veloseller"

echo "==> [1/9] apt update + базовые пакеты"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
# Python — берём системный (на noble это 3.12, на jammy 3.10/3.11)
apt-get install -y -qq curl ca-certificates gnupg lsb-release software-properties-common \
  git ufw nginx certbot python3-certbot-nginx \
  python3 python3-venv python3-pip python3-dev build-essential

PYTHON_BIN="$(command -v python3)"
echo "    Python: $($PYTHON_BIN --version)"

echo "==> [2/9] Node.js 22 (NodeSource)"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "    Node: $(node -v)"

echo "==> [3/9] Пользователь $DEPLOY_USER"
if ! id "$DEPLOY_USER" &>/dev/null; then
  useradd -m -s /bin/bash -d "/home/$DEPLOY_USER" "$DEPLOY_USER"
fi
mkdir -p "$DEPLOY_DIR"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_DIR"
mkdir -p "/home/$DEPLOY_USER/.ssh"
chmod 700 "/home/$DEPLOY_USER/.ssh"
touch "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"

echo "==> [4/9] Clone репо"
if [ ! -d "$DEPLOY_DIR/.git" ]; then
  sudo -u "$DEPLOY_USER" git clone "$REPO" "$DEPLOY_DIR"
fi

echo "==> [5/9] Python venv для worker"
cd "$DEPLOY_DIR/apps/worker"
sudo -u "$DEPLOY_USER" "$PYTHON_BIN" -m venv .venv
sudo -u "$DEPLOY_USER" .venv/bin/pip install --upgrade pip --quiet
sudo -u "$DEPLOY_USER" .venv/bin/pip install -r requirements.txt --quiet

echo "==> [6/9] Next.js npm install для web"
cd "$DEPLOY_DIR/apps/web"
sudo -u "$DEPLOY_USER" npm install --legacy-peer-deps --no-audit --no-fund

echo "==> [7/9] systemd-units"
cp "$DEPLOY_DIR/deploy/veloseller-web.service" /etc/systemd/system/
cp "$DEPLOY_DIR/deploy/veloseller-worker.service" /etc/systemd/system/
systemctl daemon-reload

echo "==> [8/9] nginx"
cp "$DEPLOY_DIR/deploy/nginx.conf" "/etc/nginx/sites-available/veloseller"
# Если домен передан, подставляем; иначе оставляем _ (catch-all для IP)
if [ "$DOMAIN" = "_" ]; then
  sed -i "s|server_name __DOMAIN__;|server_name _;|" "/etc/nginx/sites-available/veloseller"
else
  sed -i "s|__DOMAIN__|$DOMAIN|g" "/etc/nginx/sites-available/veloseller"
fi
ln -sf "/etc/nginx/sites-available/veloseller" "/etc/nginx/sites-enabled/veloseller"
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "==> [9/9] firewall"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo
echo "✅ Bootstrap завершён."
echo
echo "ДАЛЬНЕЙШИЕ ШАГИ:"
echo "  1. cp $DEPLOY_DIR/deploy/env.web.example $DEPLOY_DIR/apps/web/.env.production"
echo "  2. cp $DEPLOY_DIR/deploy/env.worker.example $DEPLOY_DIR/apps/worker/.env"
echo "  3. nano оба файла, подставить реальные ключи"
echo "  4. chmod 600 + chown veloseller:veloseller на оба .env"
echo "  5. bash $DEPLOY_DIR/deploy/finalize.sh $DOMAIN"
