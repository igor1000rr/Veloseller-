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

# Кластер Next за nginx upstream (см. deploy/nginx-veloseller-upstream.conf).
# Порты ДОЛЖНЫ совпадать со списком server в upstream veloseller_web.
# 4-ядерная коробка → 3 инстанса (одно ядро оставляем Postgres/воркеру).
WEB_PORTS=(3001 3002 3003)

[ -f "$WEB_ENV" ] || err "Нет $WEB_ENV — создай (см. deploy/README.md)"
[ -f "$WORKER_ENV" ] || err "Нет $WORKER_ENV — создай (см. deploy/README.md)"

log "Выравниваем владельца app-каталогов (НЕ трогая deploy/) на $DEPLOY_USER…"
# Апп-каталоги — их пишет npm install / npm run build / git pull
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_DIR/apps" 2>/dev/null || true
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_DIR/supabase" 2>/dev/null || true
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_DIR/.git" 2>/dev/null || true
# Корневые файлы npm workspaces — владелец npm-юзер
chown "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_DIR"/{package.json,package-lock.json} 2>/dev/null || true
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
# Сравниваем содержимое и копируем если разное.
#
# Веб работает КЛАСТЕРОМ инстансов из шаблона veloseller-web@.service
# (по одному на порт из WEB_PORTS), за nginx upstream. Старый одиночный
# veloseller-web.service больше НЕ синкается и НЕ рестартится этим скриптом —
# после перехода на кластер его нужно один раз остановить и отключить вручную:
#   sudo systemctl disable --now veloseller-web
SYSTEMD_DIR=/etc/systemd/system
UNIT_CHANGED=0
for unit in veloseller-worker.service veloseller-web@.service; do
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
log "Рестарт worker…"
systemctl restart veloseller-worker
sleep 3

log "Рестарт web-кластера (порты: ${WEB_PORTS[*]})…"
for port in "${WEB_PORTS[@]}"; do
  systemctl enable "veloseller-web@${port}" >/dev/null 2>&1 || true
  systemctl restart "veloseller-web@${port}"
  sleep 2
done

log "Статус worker:"
systemctl is-active veloseller-worker >/dev/null && echo "  ✅ работает" || {
  err "worker не запустился. Логи: journalctl -u veloseller-worker -n 50 --no-pager"
}

log "Статус web-инстансов:"
for port in "${WEB_PORTS[@]}"; do
  systemctl is-active "veloseller-web@${port}" >/dev/null && echo "  ✅ web:${port}" || {
    err "web@${port} не запустился. Логи: journalctl -u veloseller-web@${port} -n 50 --no-pager"
  }
done

log "Проверяем HTTP по инстансам…"
for port in "${WEB_PORTS[@]}"; do
  ok=0
  for i in 1 2 3 4 5; do
    if curl -fsS -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:${port}" | grep -qE "^(200|307|308)"; then
      log "✅ Next.js отвечает на 127.0.0.1:${port}"
      ok=1
      break
    fi
    echo "  ...ждём warmup ${port} ($i/5)"
    sleep 5
  done
  [ "$ok" = "1" ] || err "web@${port} не отвечает на HTTP. Логи: journalctl -u veloseller-web@${port} -n 50 --no-pager"
done

echo
log "✅ Deploy завершён. Сайт: http://$(hostname -I | awk '{print $1}')/"
echo
echo "Логи:"
echo "  journalctl -u 'veloseller-web@*' -f"
echo "  journalctl -u veloseller-worker -f"
