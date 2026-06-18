#!/usr/bin/env bash
# Автодеплой EU: подтянуть origin/main и, если есть изменения, выкатить.
# Запускается systemd-таймером от юзера veloseller (у него core.sshCommand
# на ~/.ssh/gh_veloseller — read-only deploy key, и sudo NOPASSWD на finalize.sh).
# Секреты/Actions-ключи не нужны — всё локально на сервере.
set -euo pipefail

DIR=/opt/veloseller
cd "$DIR"

git fetch origin main --quiet
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "[autopull] main без изменений ($LOCAL)"
  exit 0
fi

echo "[autopull] $LOCAL → $REMOTE — выкатываю"
git reset --hard origin/main
sudo bash "$DIR/deploy/finalize.sh"
echo "[autopull] готово ($(git rev-parse --short HEAD))"
