#!/usr/bin/env bash
# Veloseller — bootstrap для свежего Ubuntu 24.04 VPS.
#
# ВАЖНО: НЕ ОТКЛЮЧАЕТ парольный вход в SSH.
# Это сделает отдельный скрипт `harden-ssh.sh` ПОСЛЕ того как ты убедишься,
# что SSH-ключ действительно работает. Защита от залочивания.
#
# Запуск от root:
#   export ADMIN_SSH_KEY="ssh-ed25519 AAAA... ..."
#   export ADMIN_IP="<твой_белый_IP>"
#   curl -sSL https://raw.githubusercontent.com/igor1000rr/Veloseller-/main/deploy/secure-bootstrap.sh | bash
set -euo pipefail

log() { echo -e "\033[1;32m[bootstrap]\033[0m $*"; }
warn() { echo -e "\033[1;33m[warn]\033[0m $*"; }
err()  { echo -e "\033[1;31m[error]\033[0m $*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || err "Запускай от root"

ADMIN_SSH_KEY="${ADMIN_SSH_KEY:-}"
ADMIN_IP="${ADMIN_IP:-}"

[ -n "$ADMIN_SSH_KEY" ] || err 'ADMIN_SSH_KEY не задан. Пример: export ADMIN_SSH_KEY="ssh-ed25519 AAAA... igor@veloseller"'
[[ "$ADMIN_SSH_KEY" == ssh-* ]] || err 'ADMIN_SSH_KEY выглядит странно — он должен начинаться с ssh-ed25519 или ssh-rsa'

# ============ 1. apt update ============
log "Обновляем систему…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get -y -qq -o DPkg::Options::=--force-confdef -o DPkg::Options::=--force-confold upgrade

# ============ 2. Базовые пакеты ============
log "Ставим базовые пакеты…"
apt-get install -y -qq \
  curl ca-certificates gnupg lsb-release \
  ufw fail2ban unattended-upgrades \
  git rsync htop tmux jq cron \
  build-essential python3.12 python3.12-venv python3-pip \
  nginx openssl

# ============ 3. Node 22 LTS ============
if ! command -v node >/dev/null || ! node --version | grep -q "^v22"; then
  log "Ставим Node 22…"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
node --version

# ============ 4. Пользователь veloseller ============
log "Создаём пользователя veloseller…"
if ! id -u veloseller >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" --shell /bin/bash veloseller
fi

# SSH-ключ в /home/veloseller/.ssh/authorized_keys
mkdir -p /home/veloseller/.ssh
touch /home/veloseller/.ssh/authorized_keys
if ! grep -qF "$ADMIN_SSH_KEY" /home/veloseller/.ssh/authorized_keys; then
  echo "$ADMIN_SSH_KEY" >> /home/veloseller/.ssh/authorized_keys
fi
chown -R veloseller:veloseller /home/veloseller/.ssh
chmod 700 /home/veloseller/.ssh
chmod 600 /home/veloseller/.ssh/authorized_keys

# SSH-ключ в /root/.ssh/authorized_keys (бэкап-вход)
mkdir -p /root/.ssh
touch /root/.ssh/authorized_keys
if ! grep -qF "$ADMIN_SSH_KEY" /root/.ssh/authorized_keys; then
  echo "$ADMIN_SSH_KEY" >> /root/.ssh/authorized_keys
fi
chown root:root /root/.ssh /root/.ssh/authorized_keys
chmod 700 /root/.ssh
chmod 600 /root/.ssh/authorized_keys

# sudo для veloseller выдаём УЗКИМ списком команд (deploy/sudoers.veloseller),
# а НЕ `NOPASSWD: ALL`. Файл лежит в репо → ставим ниже, ПОСЛЕ клонирования (шаг 8).
# Раньше тут был полный беспарольный root — при компрометации SSH-ключа Actions
# или RCE в Next.js (бежит под этим же юзером) это давало полный контроль над VPS.

# ============ 5. fail2ban ============
log "Настраиваем fail2ban…"
cat > /etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
port    = 22
filter  = sshd
backend = systemd
maxretry = 3
findtime = 10m
bantime  = 1h
EOF
systemctl enable --now fail2ban

# ============ 6. ufw ============
log "Настраиваем firewall (ufw)…"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
if [ -n "$ADMIN_IP" ]; then
  ufw allow from "$ADMIN_IP" to any port 22 proto tcp
  warn "SSH открыт ТОЛЬКО с IP $ADMIN_IP. Если IP сменится — залокаешься. Обновить: ufw allow from <new> to any port 22"
else
  ufw allow 22/tcp
fi
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# ============ 7. unattended-upgrades ============
log "Автопатчи безопасности…"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

# ============ 8. Клонируем репо ============
log "Клонируем репозиторий…"
if [ ! -d /opt/veloseller/.git ]; then
  install -d -o veloseller -g veloseller /opt/veloseller
  sudo -u veloseller -H git clone https://github.com/igor1000rr/Veloseller-.git /opt/veloseller
else
  sudo -u veloseller -H bash -c 'cd /opt/veloseller && git pull --ff-only'
fi
chown -R veloseller:veloseller /opt/veloseller

# ============ 8b. Узкий sudoers для деплоя ============
# Только нужные деплою команды (finalize.sh, systemctl restart кластера, chown),
# а не NOPASSWD: ALL. Файл — из репо, проверяем visudo перед установкой.
log "Ставим узкий sudoers для veloseller…"
install -m 440 -o root -g root /opt/veloseller/deploy/sudoers.veloseller /etc/sudoers.d/veloseller
visudo -cf /etc/sudoers.d/veloseller || err "sudoers невалидный"

# ============ 9. nginx ============
log "Настраиваем nginx…"
cp /opt/veloseller/deploy/nginx-secure.conf /etc/nginx/sites-available/veloseller
cp /opt/veloseller/deploy/proxy-buffers.conf /etc/nginx/conf.d/proxy-buffers.conf
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/veloseller /etc/nginx/sites-enabled/veloseller
nginx -t || err "nginx config невалиден"
systemctl reload nginx

# ============ 10. systemd units ============
log "Регистрируем systemd-сервисы…"
cp /opt/veloseller/deploy/veloseller-web.service /etc/systemd/system/
cp /opt/veloseller/deploy/veloseller-worker.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable veloseller-web veloseller-worker

# ============ 11. Генерируем секреты ============
log "Генерируем WORKER_SECRET и SECRET_ENCRYPTION_KEY…"
WORKER_SECRET=$(openssl rand -base64 32 | tr -d '\n')
SECRET_ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d '\n')
SECRETS_FILE=/root/veloseller-secrets.txt
cat > "$SECRETS_FILE" <<EOF
# Секреты сгенерированы $(date)
WORKER_SECRET=$WORKER_SECRET
SECRET_ENCRYPTION_KEY=$SECRET_ENCRYPTION_KEY
EOF
chmod 600 "$SECRETS_FILE"

echo
echo "=================================================="
log "✅ Bootstrap завершён — без отключения парольного входа."
echo
echo "Секреты сохранены в $SECRETS_FILE (читать только от root)."
echo
echo "Дальше из ДРУГОГО окна проверь что SSH-ключ работает:"
echo "  ssh veloseller@\$(hostname -I | awk '{print \$1}')"
echo
echo "И только ПОСЛЕ этого:"
echo "  1. Заполни .env (см. deploy/README.md)"
echo "  2. sudo /opt/veloseller/deploy/finalize.sh"
echo "  3. sudo /opt/veloseller/deploy/harden-ssh.sh   # отключит парольный вход SSH"
echo "=================================================="
