#!/bin/bash
#
# Veloseller — бутстрап сервера (Ubuntu 22.04+).
# Запускается ОДИН раз под root.
#
# Что делает:
#  1. Обновляет систему + apt-пакеты
#  2. Ставит Node.js 22, Python 3.11, nginx, certbot, git
#  3. Создаёт пользователя veloseller и проект в /opt/veloseller
#  4. Клонирует репо и ставит зависимости
#  5. Ставит systemd-units для web + worker
#  6. Настраивает nginx reverse proxy
#  7. Отключает root SSH (без пароля — только ключи для veloseller)
#
set -euo pipefail

DOMAIN="${1:-veloseller.com}"        # домен из аргумента
REPO="${2:-https://github.com/igor1000rr/Veloseller-.git}"
DEPLOY_USER="veloseller"
DEPLOY_DIR="/opt/veloseller"

echo "==> [1/9] apt update + базовые пакеты"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg lsb-release software-properties-common \
  git ufw nginx certbot python3-certbot-nginx \
  python3.11 python3.11-venv python3-pip build-essential

echo "==> [2/9] Node.js 22 (NodeSource)"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
npm install -g pnpm@9 || true   # pnpm опционально — навсякий

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
sudo -u "$DEPLOY_USER" python3.11 -m venv .venv
sudo -u "$DEPLOY_USER" .venv/bin/pip install --upgrade pip --quiet
sudo -u "$DEPLOY_USER" .venv/bin/pip install -r requirements.txt --quiet

echo "==> [6/9] Next.js build для web"
cd "$DEPLOY_DIR/apps/web"
sudo -u "$DEPLOY_USER" npm install --legacy-peer-deps --no-audit --no-fund
# build попробуем позже, надо сначала положить .env

echo "==> [7/9] systemd-units"
cp "$DEPLOY_DIR/deploy/veloseller-web.service" /etc/systemd/system/
cp "$DEPLOY_DIR/deploy/veloseller-worker.service" /etc/systemd/system/
systemctl daemon-reload

echo "==> [8/9] nginx + SSL"
cp "$DEPLOY_DIR/deploy/nginx.conf" "/etc/nginx/sites-available/veloseller"
sed -i "s|__DOMAIN__|$DOMAIN|g" "/etc/nginx/sites-available/veloseller"
ln -sf "/etc/nginx/sites-available/veloseller" "/etc/nginx/sites-enabled/veloseller"
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "==> [9/9] firewall + sshd hardening"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo
echo "✅ Bootstrap завершён."
echo
echo "ДАЛЬНЕЙШИЕ ШАГИ (вручную):"
echo "  1. Добавить публичный SSH-ключ deploy-юзера в ~veloseller/.ssh/authorized_keys"
echo "     (это GitHub Actions ключ, будет сгенерирован на твоём компьютере)"
echo "  2. Создать $DEPLOY_DIR/apps/web/.env.production и $DEPLOY_DIR/apps/worker/.env"
echo "     (примеры в deploy/env.web.example и deploy/env.worker.example)"
echo "  3. Запустить: bash $DEPLOY_DIR/deploy/finalize.sh $DOMAIN"
echo
echo "ПОСЛЕ ЭТОГО ОТКЛЮЧИ ПАРОЛЬ root по SSH:"
echo "     passwd -l root"
echo "     sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config"
echo "     sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config"
echo "     systemctl restart sshd"
