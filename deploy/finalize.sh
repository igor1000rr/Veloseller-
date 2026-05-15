#!/usr/bin/env bash
# Veloseller — финальный деплой: установка зависимостей + сборка + запуск сервисов.
# Запускать после заполнения .env-файлов:
#   sudo /opt/veloseller/deploy/finalize.sh
set -euo pipefail

log() { echo -e "\033[1;32m[finalize]\033[0m $*"; }
err()  { echo -e "\033[1;31m[error]\033[0m $*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || err "Запускай от root (sudo)"

DEPLOY_DIR=/opt/veloseller
DEPLOY_USER=veloseller
WEB_ENV="$DEPLOY_DIR/apps/web/.env.production"
WORKER_ENV="$DEPLOY_DIR/apps/worker/.env"

[ -f "$WEB_ENV" ] || err "Нет $WEB_ENV — создай (см. deploy/README.md)"
[ -f "$WORKER_ENV" ] || err "Нет $WORKER_ENV — создай (см. deploy/README.md)"

log "Выравниваем владельца /opt/veloseller на $DEPLOY_USER…"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_DIR"
chmod 600 "$WEB_ENV" "$WORKER_ENV"

# ===== Web =====
log "npm ci (корень монорепо — все workspace-зависимости)…"
sudo -u "$DEPLOY_USER" -H bash -c "cd $DEPLOY_DIR && npm ci --no-audit --no-fund"

log "npm run build (Next.js production build, может занять 3-5 мин)…"
sudo -u "$DEPLOY_USER" -H bash -c "cd $DEPLOY_DIR/apps/web && npm run build"

# ===== Worker =====
if [ ! -d "$DEPLOY_DIR/apps/worker/.venv" ]; then
  log "Создаём Python venv для worker…"
  sudo -u "$DEPLOY_USER" -H python3.12 -m venv "$DEPLOY_DIR/apps/worker/.venv"
fi
log "pip install зависимостей worker…"
sudo -u "$DEPLOY_USER" -H bash -c "
  cd $DEPLOY_DIR/apps/worker
  .venv/bin/pip install --quiet --upgrade pip
  .venv/bin/pip install --quiet -r requirements.txt
"

# ===== Service start =====
log "Рестарт systemd сервисов…"
systemctl daemon-reload
systemctl restart veloseller-worker
sleep 3
systemctl restart veloseller-web
sleep 3

log "Статус worker:"
systemctl is-active veloseller-worker && echo "  ✅ работает" || {
  err "worker не запустился. Логи: journalctl -u veloseller-worker -n 50 --no-pager"
}

log "Статус web:"
systemctl is-active veloseller-web && echo "  ✅ работает" || {
  err "web не запустился. Логи: journalctl -u veloseller-web -n 50 --no-pager"
}

log "Проверяем HTTP…"
for i in 1 2 3 4 5; do
  if curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000 | grep -qE "^(200|307|308)"; then
    log "✅ Next.js отвечает на 127.0.0.1:3000"
    break
  fi
  echo "  ...ждём warmup ($i/5)"
  sleep 5
done

echo
log "✅ Deploy завершён. Сайт: http://$(hostname -I | awk '{print $1}')/"
echo
echo "Логи:"
echo "  journalctl -u veloseller-web -f"
echo "  journalctl -u veloseller-worker -f"
echo
echo "Дальше: отключи парольный SSH — sudo /opt/veloseller/deploy/harden-ssh.sh"
