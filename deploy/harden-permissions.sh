#!/usr/bin/env bash
# Полный hardening permissions — запустить ОДИН РАЗ после первого деплоя.
#
# После этого:
#  - /opt/veloseller/deploy/ принадлежит root:root
#  - veloseller НЕ может переписать finalize.sh и родственные скрипты
#  - теперь sudoers «run finalize.sh» безопасен (файл неперезаписываемый)
#  - атакующий с RCE под veloseller не сможет эскалировать до root
#
# ЦЕНА: git pull не будет обновлять deploy/ автоматически. Обновления deploy-скриптов
# придётся катить руками:
#   sudo cp /path/to/new-finalize.sh /opt/veloseller/deploy/finalize.sh
#   sudo chown root:root /opt/veloseller/deploy/finalize.sh
#   sudo chmod 755 /opt/veloseller/deploy/finalize.sh

set -euo pipefail

[ "$(id -u)" = "0" ] || { echo "Запускай от root"; exit 1; }

DEPLOY_DIR=/opt/veloseller

echo "→ Передаём владение $DEPLOY_DIR/deploy/ → root:root"
chown -R root:root "$DEPLOY_DIR/deploy"
chmod 755 "$DEPLOY_DIR/deploy"
find "$DEPLOY_DIR/deploy" -type f -name "*.sh" -exec chmod 755 {} \;
find "$DEPLOY_DIR/deploy" -type f ! -name "*.sh" -exec chmod 644 {} \;

echo "→ Проверяем что юзер veloseller НЕ может писать в deploy/…"
if sudo -u veloseller test -w "$DEPLOY_DIR/deploy/finalize.sh" 2>/dev/null; then
  echo "❌ ОШИБКА: veloseller всё ещё может писать в finalize.sh!"
  exit 1
fi
echo "  ✅ ОК"

echo
echo "✅ Hardening применён."
echo
echo "ВАЖНО: теперь при автодеплое git reset --hard origin/main под veloseller"
echo "НЕ сможет переписать файлы в deploy/. Это сознательный trade-off:"
echo "  ✅ RCE под veloseller не эскалируется до root через подмену finalize.sh"
echo "  ⚠  Обновления deploy/*.sh в git не попадают на VPS автоматически"
echo
echo "Обновление deploy-скриптов (вручную от root):"
echo "  cd /tmp && git clone https://github.com/igor1000rr/Veloseller-.git veloseller-fresh"
echo "  sudo cp veloseller-fresh/deploy/*.sh $DEPLOY_DIR/deploy/"
echo "  sudo chown root:root $DEPLOY_DIR/deploy/*.sh"
echo "  sudo chmod 755 $DEPLOY_DIR/deploy/*.sh"
