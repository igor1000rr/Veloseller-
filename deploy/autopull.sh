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

# Безопасность: push в main = выполнение кода как root на этом VPS (ниже
# sudo finalize.sh), причём БЕЗ гейта CI. Если AUTOPULL_REQUIRE_SIGNED=1 —
# катим только коммит с валидной GPG-подписью доверенного ключа (git
# verify-commit). Иначе хотя бы шумно предупреждаем. Рекомендуется подписывать
# релизные коммиты и выставить AUTOPULL_REQUIRE_SIGNED=1 в окружении таймера.
if [ "${AUTOPULL_REQUIRE_SIGNED:-0}" = "1" ]; then
  if ! git verify-commit "$REMOTE" >/dev/null 2>&1; then
    echo "[autopull] ОТКАЗ: $REMOTE без валидной GPG-подписи (AUTOPULL_REQUIRE_SIGNED=1)" >&2
    exit 1
  fi
  echo "[autopull] GPG-подпись $REMOTE проверена"
else
  echo "[autopull] ⚠ деплой без проверки подписи — push в main исполнится как root" >&2
fi

echo "[autopull] $LOCAL → $REMOTE — выкатываю"
git reset --hard origin/main
sudo bash "$DIR/deploy/finalize.sh"
echo "[autopull] готово ($(git rev-parse --short HEAD))"
