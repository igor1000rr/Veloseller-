#!/usr/bin/env bash
# Veloseller — финальное усиление SSH (выполнять ТОЛЬКО ПОСЛЕ проверки что SSH-ключ работает!).
# Отключает:
#   - парольный вход (PasswordAuthentication no)
#   - root SSH без ключа (PermitRootLogin prohibit-password)
#
# Имеет 4 предохранителя:
#   1. Проверяет что /home/veloseller/.ssh/authorized_keys не пустой
#   2. Проверяет что /root/.ssh/authorized_keys не пустой
#   3. Проверяет что sshd валиден перед reload
#   4. Требует явного подтверждения «YES»
set -euo pipefail

log() { echo -e "\033[1;32m[harden]\033[0m $*"; }
warn() { echo -e "\033[1;33m[warn]\033[0m $*"; }
err()  { echo -e "\033[1;31m[error]\033[0m $*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || err "Запускай от root (sudo)"

# === Pre-flight: проверки ===
VELOS_KEYS=/home/veloseller/.ssh/authorized_keys
ROOT_KEYS=/root/.ssh/authorized_keys

[ -s "$VELOS_KEYS" ] || err "$VELOS_KEYS пустой или отсутствует. Отключать пароль ОПАСНО — залокаешься."
[ -s "$ROOT_KEYS" ]   || err "$ROOT_KEYS пустой или отсутствует. Отключать пароль ОПАСНО."

log "Найдены authorized_keys:"
echo "  $VELOS_KEYS:"
awk '{print "    " substr($0,1,60) "..."}' "$VELOS_KEYS"
echo "  $ROOT_KEYS:"
awk '{print "    " substr($0,1,60) "..."}' "$ROOT_KEYS"
echo
warn "ПОДТВЕРДИ, что уже в другом окне выполнил 'ssh veloseller@<IP>' И ОНО РАБОТАЕТ!"
read -r -p "Напиши 'YES' для продолжения: " CONFIRM
[ "$CONFIRM" = "YES" ] || err "Отменено"

# === Бэкап sshd_config ===
log "Бэкап sshd_config…"
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.before-harden.$(date +%s)

# === Правим главный sshd_config ===
SSHD=/etc/ssh/sshd_config
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin prohibit-password/' "$SSHD"
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' "$SSHD"
sed -i 's/^#*KbdInteractiveAuthentication.*/KbdInteractiveAuthentication no/' "$SSHD"
sed -i 's/^#*ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' "$SSHD"
sed -i 's/^#*X11Forwarding.*/X11Forwarding no/' "$SSHD"
grep -q '^AllowUsers' "$SSHD" || echo 'AllowUsers root veloseller' >> "$SSHD"

# === Чистим cloud-init overrides ===
for f in /etc/ssh/sshd_config.d/*.conf; do
  [ -f "$f" ] || continue
  sed -i 's/^PasswordAuthentication.*/PasswordAuthentication no/' "$f" || true
  sed -i 's/^PermitRootLogin.*/PermitRootLogin prohibit-password/' "$f" || true
done

# === Проверяем конфиг ПЕРЕД reload ===
log "Проверяем конфиг…"
sshd -t || err "sshd_config невалиден! Ничего не релоажу. Восстанови из .before-harden"

# === Перезагружаем без разрыва сессии ===
log "Reload sshd (текущая твоя SSH-сессия НЕ разорвётся)…"
systemctl reload ssh

echo
log "✅ SSH защищён. Парольный вход отключён, вход только по ключу."
echo
warn "НЕ ЗАКРЫВАЙ текущую сессию! Сначала в НОВОМ окне проверь:"
echo "  ssh veloseller@\$(hostname -I | awk '{print \$1}')"
echo "Если пустит без пароля — всё ОК, можно закрывать root-сессию."
