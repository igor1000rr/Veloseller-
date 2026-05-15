#!/usr/bin/env bash
# Veloseller — защищённый bootstrap для свежего Ubuntu 24.04 VPS.
# Запуск от root:
#   curl -sSL https://raw.githubusercontent.com/igor1000rr/Veloseller-/main/deploy/secure-bootstrap.sh | bash
#
# Порядок:
#   1. Обновляем систему
#   2. Ставим fail2ban + unattended-upgrades
#   3. SSH: отключаем пароль и root login (ПОСЛЕ добавления твоего ключа!)
#   4. ufw: deny incoming, allow 22/80/443
#   5. Создаём user veloseller (без пароля, только SSH)
#   6. Node 22, Python 3.11, nginx
#   7. Клонируем репо
set -euo pipefail

log() { echo -e "\033[1;32m[bootstrap]\033[0m $*"; }
err() { echo -e "\033[1;31m[error]\033[0m $*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || err "Запускай от root"

# Собираем обязательные переменные
ADMIN_SSH_KEY="${ADMIN_SSH_KEY:-}"
ADMIN_IP="${ADMIN_IP:-}"
if [ -z "$ADMIN_SSH_KEY" ]; then
  err "Нужен ADMIN_SSH_KEY: твой публичный SSH-ключ (ssh-ed25519 … или ssh-rsa …).
Пример:
  export ADMIN_SSH_KEY=\"\$(cat ~/.ssh/id_ed25519.pub)\"
  export ADMIN_IP=\"\$(curl -s ifconfig.me)\"
  curl -sSL https://raw…/secure-bootstrap.sh | bash"
fi

# ============ 1. apt update ============
log "Обновляем систему…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

# ============ 2. Базовые пакеты ============
log "Ставим базовые пакеты…"
apt-get install -y -qq \
  curl ca-certificates gnupg lsb-release \
  ufw fail2ban unattended-upgrades \
  git rsync htop tmux jq cron \
  build-essential python3.12 python3.12-venv python3-pip \
  nginx

# ============ 3. Node 22 LTS через NodeSource ============
log "Ставим Node 22…"
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y -qq nodejs
node --version

# ============ 4. Пользователь veloseller (без пароля) ============
log "Создаём пользователя veloseller…"
if ! id -u veloseller >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" --shell /bin/bash veloseller
fi
mkdir -p /home/veloseller/.ssh
echo "$ADMIN_SSH_KEY" >> /home/veloseller/.ssh/authorized_keys
sort -u /home/veloseller/.ssh/authorized_keys -o /home/veloseller/.ssh/authorized_keys
chown -R veloseller:veloseller /home/veloseller/.ssh
chmod 700 /home/veloseller/.ssh
chmod 600 /home/veloseller/.ssh/authorized_keys

# Дублируем ключ в root (на всякий случай — чтобы не залокаться)
mkdir -p /root/.ssh
echo "$ADMIN_SSH_KEY" >> /root/.ssh/authorized_keys
sort -u /root/.ssh/authorized_keys -o /root/.ssh/authorized_keys
chmod 700 /root/.ssh
chmod 600 /root/.ssh/authorized_keys

# ============ 5. SSH hardening ============
log "SSH: отключаем парольный вход и root login…"
SSHD_CONFIG=/etc/ssh/sshd_config
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin prohibit-password/' "$SSHD_CONFIG"
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' "$SSHD_CONFIG"
sed -i 's/^#*KbdInteractiveAuthentication.*/KbdInteractiveAuthentication no/' "$SSHD_CONFIG"
sed -i 's/^#*ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' "$SSHD_CONFIG"
sed -i 's/^#*X11Forwarding.*/X11Forwarding no/' "$SSHD_CONFIG"
grep -q '^AllowUsers' "$SSHD_CONFIG" || echo 'AllowUsers root veloseller' >> "$SSHD_CONFIG"
# Отключаем в новых cloud-init conf, которые переопределяют
for f in /etc/ssh/sshd_config.d/*.conf; do
  [ -f "$f" ] || continue
  sed -i 's/^PasswordAuthentication.*/PasswordAuthentication no/' "$f" || true
done
systemctl restart ssh

# ============ 6. fail2ban ============
log "Настраиваем fail2ban…"
cat > /etc/fail2ban/jail.d/sshd.local <<EOF
[sshd]
enabled = true
port    = 22
filter  = sshd
logpath = %(sshd_log)s
backend = systemd
maxretry = 3
findtime = 10m
bantime  = 1h
EOF
systemctl enable --now fail2ban

# ============ 7. ufw ============
log "Настраиваем firewall (ufw)…"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
if [ -n "$ADMIN_IP" ]; then
  log "Допускаем SSH только с $ADMIN_IP из ufw (помимо fail2ban)…"
  ufw delete allow 22/tcp || true
  ufw allow from "$ADMIN_IP" to any port 22 proto tcp
fi
ufw --force enable

# ============ 8. unattended-upgrades ============
log "Включаем автопатчи безопасности…"
dpkg-reconfigure -plow unattended-upgrades || true
cat > /etc/apt/apt.conf.d/20auto-upgrades <<EOF
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

# ============ 9. Клонируем репо ============
log "Клонируем репозиторий Veloseller…"
install -d -o veloseller -g veloseller /opt/veloseller
sudo -u veloseller -H git clone https://github.com/igor1000rr/Veloseller-.git /opt/veloseller 2>/dev/null || \
  sudo -u veloseller -H bash -c 'cd /opt/veloseller && git pull'

# ============ 10. Настройка nginx (из репо) ============
log "Ставим nginx config + rate-limit + scanner-block…"
cp /opt/veloseller/deploy/nginx-secure.conf /etc/nginx/sites-available/veloseller
cp /opt/veloseller/deploy/proxy-buffers.conf /etc/nginx/conf.d/proxy-buffers.conf
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/veloseller /etc/nginx/sites-enabled/veloseller
nginx -t
systemctl reload nginx

# ============ 11. systemd units ============
log "Регистрируем systemd-сервисы…"
cp /opt/veloseller/deploy/veloseller-web.service /etc/systemd/system/
cp /opt/veloseller/deploy/veloseller-worker.service /etc/systemd/system/
cp /opt/veloseller/deploy/sudoers.veloseller /etc/sudoers.d/veloseller
chmod 440 /etc/sudoers.d/veloseller
visudo -cf /etc/sudoers.d/veloseller
systemctl daemon-reload
systemctl enable veloseller-web veloseller-worker

log "✅ Bootstrap завершён."
echo "Дальше:"
echo "  1. Скопируй .env-файлы и выполни:"
# в finalize.sh идёт npm/pip install + build + restart
echo "     sudo -u veloseller bash /opt/veloseller/deploy/finalize.sh"
echo "  2. Смени root пароль: passwd root"
echo "  3. Проверь: ufw status, fail2ban-client status"
