#!/usr/bin/env bash
# Veloseller — финальный деплой: установка зависимостей + сборка + запуск сервисов.
# Запускать после заполнения .env-файлов:
#   sudo /opt/veloseller/deploy/finalize.sh
#
# HARDENING: chown только приложенческих каталогов (apps, supabase, node_modules, .git),
# НЕ /opt/veloseller целиком. Это позволяет deploy/ принадлежать root:root и быть
# нередактируемым для юзера veloseller — таким образом, при RCE в Next.js
# атакующий НЕ сможет переписать finalize.sh и эскалировать через sudo.
# Чтобы включить полный hardening, запустить один раз:
#   sudo bash /opt/veloseller/deploy/harden-permissions.sh

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

log "Выравниваем владельца app-каталогов (НЕ трогая deploy/) на $DEPLOY_USER…"
# Апп-каталоги — их пишет npm install / npm run build / git pull
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_DIR/apps" 2>/dev/null || true
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_DIR/supabase" 2>/dev/null || true
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_DIR/.git" 2>/dev/null || true
# Корневые файлы npm workspaces — владелец npm-юзер
chown "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_DIR"/{package.json,package-lock.json,pnpm-workspace.yaml} 2>/dev/null || true
chown "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_DIR"/{README.md,TODO.md,.gitignore,.env.example,docker-compose.yml} 2>/dev/null || true
if [ -d "$DEPLOY_DIR/node_modules" ]; then
  chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_DIR/node_modules"
fi
# .env — права только владельцу (там API ключи и SECRET_ENCRYPTION_KEY)
chmod 600 "$WEB_ENV" "$WORKER_ENV"

# ===== Web =====
# npm ci требует package-lock.json в синхроне с package.json.
# На VPS мог остаться stale lockfile от прошлого npm install (не в git) — тогда ci падает.
# Источник истины: lockfile только если он закоммичен в репозиторий.
if git -C "$DEPLOY_DIR" ls-files --error-unmatch package-lock.json >/dev/null 2>&1; then
  log "npm ci (корень монорепо — все workspace-зависимости)…"
  sudo -u "$DEPLOY_USER" -H bash -c "cd $DEPLOY_DIR && npm ci --legacy-peer-deps --no-audit --no-fund"
else
  rm -f "$DEPLOY_DIR/package-lock.json"
  log "package-lock.json не в git — npm install (5-10 мин)…"
  sudo -u "$DEPLOY_USER" -H bash -c "cd $DEPLOY_DIR && npm install --legacy-peer-deps --no-audit --no-fund"
fi

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

# ===== systemd-units (sync changes from repo to /etc) =====
# Раньше юниты копировались только в setup-server.sh при первичном бутстрапе.
# Из-за этого изменения в deploy/*.service не подхватывались на проде —
# например, 25.05.2026 правка --workers 2 → --workers 1 потребовала ручного
# вмешательства, иначе scheduler продолжал работать в двух копиях.
# Теперь сравниваем содержимое и копируем если разное.
SYSTEMD_DIR=/etc/systemd/system
UNIT_CHANGED=0
for unit in veloseller-web.service veloseller-worker.service; do
  src="$DEPLOY_DIR/deploy/$unit"
  dst="$SYSTEMD_DIR/$unit"
  if [ ! -f "$dst" ] || ! cmp -s "$src" "$dst"; then
    log "Обновляем systemd unit: $unit"
    cp "$src" "$dst"
    chmod 644 "$dst"
    UNIT_CHANGED=1
  fi
done

if [ "$UNIT_CHANGED" = "1" ]; then
  log "Перезагружаем systemd конфигурацию (daemon-reload)…"
  systemctl daemon-reload
fi

# ===== Service start =====
log "Рестарт systemd сервисов…"
systemctl restart veloseller-worker
sleep 3
systemctl restart veloseller-web
sleep 3

log "Статус worker:"
systemctl is-active veloseller-worker && echo "  ✅ работает" || {
  err "worker не запустился. Логи: journalctl -u veloseller-worker -n 50 --no-pager"
}

log "Статус web:"
systemctl is-active veloseller-web && echo "  ✅ работает" || {
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
