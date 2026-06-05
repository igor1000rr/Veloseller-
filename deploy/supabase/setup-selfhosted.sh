#!/usr/bin/env bash
# Самостоятельный Supabase для Veloseller (инцидент 05.06.2026: уход с облака).
#
# Что делает:
#   1. Клонирует официальный supabase/supabase (каталог docker/ — compose,
#      kong.yml, init-SQL согласованы с версиями образов, мы их НЕ патчим).
#   2. Генерирует все секреты: POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY и
#      SERVICE_ROLE_KEY (HS256-JWT, подписанные JWT_SECRET), пароль дашборда.
#   3. Пишет .env под Veloseller: SMTP Resend для писем Auth, домен API,
#      Postgres 17 (официальный override docker-compose.pg17.yml — та же
#      мажорная версия, что у облака 17.6: дамп/restore без даунгрейда).
#   4. Поднимает только нужные сервисы (без edge-runtime: не используем).
#
# Использование (на сервере, под root, docker уже установлен):
#   APP_SITE_URL=https://veloseller.ru RESEND_API_KEY=re_xxx \
#     bash setup-selfhosted.sh api.veloseller.ru /opt/supabase
#   1-й аргумент — публичный домен Supabase API (A-запись на этот сервер),
#   2-й — каталог установки (default /opt/supabase).
#   APP_SITE_URL — адрес самого приложения: уходит в ссылки auth-писем.
#
# После запуска:
#   - ключи и пароли лежат в $TARGET/docker/.env (бэкапни его!)
#   - Kong слушает ТОЛЬКО 127.0.0.1:8000 — наружу выставлять через nginx+TLS
#   - Studio доступна через тот же Kong (basic auth: DASHBOARD_USERNAME/PASSWORD)
#   - Postgres (supavisor) ТОЛЬКО 127.0.0.1:5432; админ-доступ к БД — через
#     docker exec supabase-db psql -U postgres (так работает migrate-from-cloud.sh)
set -euo pipefail

API_DOMAIN="${1:?Укажи публичный домен API, например api.veloseller.ru}"
TARGET="${2:-/opt/supabase}"
SUPABASE_REPO_REF="${SUPABASE_REPO_REF:-master}"
# URL приложения для ссылок в письмах Auth (confirm / recovery).
APP_SITE_URL="${APP_SITE_URL:-https://veloseller.ru}"

# Список сервисов, которые поднимаем. functions (edge-runtime) исключён —
# Veloseller его не использует, минус ~300МБ RAM и лишняя поверхность.
SERVICES="db supavisor kong auth rest storage imgproxy meta studio realtime"

echo "==> Клонирую supabase/supabase ($SUPABASE_REPO_REF) в $TARGET"
if [ ! -d "$TARGET/.git" ]; then
  git clone --depth 1 --branch "$SUPABASE_REPO_REF" https://github.com/supabase/supabase.git "$TARGET"
else
  git -C "$TARGET" pull --ff-only
fi
cd "$TARGET/docker"

# ── Генерация секретов ──────────────────────────────────────────────────────
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

jwt_hs256() {
  # $1 = role (anon | service_role), $2 = secret
  local role="$1" secret="$2"
  local iat exp header payload signature
  iat=$(date +%s)
  exp=$((iat + 10 * 365 * 24 * 3600))  # 10 лет
  header=$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)
  payload=$(printf '{"role":"%s","iss":"supabase","iat":%s,"exp":%s}' "$role" "$iat" "$exp" | b64url)
  signature=$(printf '%s.%s' "$header" "$payload" | openssl dgst -sha256 -hmac "$secret" -binary | b64url)
  printf '%s.%s.%s' "$header" "$payload" "$signature"
}

if [ -f .env ] && grep -q '^JWT_SECRET=' .env && ! grep -q 'your-super-secret' .env; then
  echo "==> .env уже сгенерирован — не трогаю (удали $TARGET/docker/.env для регенерации)"
else
  echo "==> Генерирую секреты"
  POSTGRES_PASSWORD=$(openssl rand -hex 24)
  JWT_SECRET=$(openssl rand -hex 32)
  ANON_KEY=$(jwt_hs256 anon "$JWT_SECRET")
  SERVICE_ROLE_KEY=$(jwt_hs256 service_role "$JWT_SECRET")
  DASHBOARD_PASSWORD=$(openssl rand -hex 12)
  SECRET_KEY_BASE=$(openssl rand -hex 32)
  VAULT_ENC_KEY=$(openssl rand -hex 16)
  PG_META_CRYPTO_KEY=$(openssl rand -hex 16)

  cp .env.example .env

  set_env() { # set_env KEY VALUE — заменяет или добавляет строку в .env
    local key="$1" value="$2"
    if grep -q "^${key}=" .env; then
      sed -i "s|^${key}=.*|${key}=${value}|" .env
    else
      printf '%s=%s\n' "$key" "$value" >> .env
    fi
  }

  # Postgres 17 — официальный override (облако Veloseller на 17.6, дамп
  # переносим версия-в-версию). Третьим — наш loopback-override (см. ниже):
  # при заданном COMPOSE_FILE compose сам docker-compose.override.yml не берёт.
  set_env COMPOSE_FILE "docker-compose.yml:docker-compose.pg17.yml:docker-compose.override.yml"

  set_env POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
  set_env JWT_SECRET "$JWT_SECRET"
  set_env ANON_KEY "$ANON_KEY"
  set_env SERVICE_ROLE_KEY "$SERVICE_ROLE_KEY"
  set_env DASHBOARD_USERNAME veloseller
  set_env DASHBOARD_PASSWORD "$DASHBOARD_PASSWORD"
  set_env SECRET_KEY_BASE "$SECRET_KEY_BASE"
  set_env VAULT_ENC_KEY "$VAULT_ENC_KEY"
  set_env PG_META_CRYPTO_KEY "$PG_META_CRYPTO_KEY"
  set_env POOLER_TENANT_ID veloseller

  # Публичные URL: API за nginx с TLS; SITE_URL — адрес приложения для писем
  set_env API_EXTERNAL_URL "https://${API_DOMAIN}"
  set_env SUPABASE_PUBLIC_URL "https://${API_DOMAIN}"
  set_env SITE_URL "$APP_SITE_URL"

  # Слушаем только localhost — наружу через nginx
  set_env KONG_HTTP_PORT 127.0.0.1:8000
  set_env KONG_HTTPS_PORT 127.0.0.1:8443

  # SMTP Resend для писем Auth (confirm / reset password).
  # API-ключ Resend НЕ хранится в репе: передай через окружение при запуске:
  #   RESEND_API_KEY=re_xxx bash setup-selfhosted.sh ...
  set_env SMTP_ADMIN_EMAIL noreply@veloseller.ru
  set_env SMTP_HOST smtp.resend.com
  set_env SMTP_PORT 465
  set_env SMTP_USER resend
  set_env SMTP_SENDER_NAME Veloseller
  if [ -n "${RESEND_API_KEY:-}" ]; then
    set_env SMTP_PASS "$RESEND_API_KEY"
  else
    echo "!! RESEND_API_KEY не задан — пропиши SMTP_PASS в $TARGET/docker/.env руками"
  fi

  # Регистрация: на .ru открыта, подтверждение почты как в облаке
  set_env DISABLE_SIGNUP false
  set_env ENABLE_EMAIL_SIGNUP true
  set_env ENABLE_EMAIL_AUTOCONFIRM false

  echo "==> Секреты записаны в $TARGET/docker/.env"
fi

# Pooler наружу не выставляем: только localhost. В официальном compose порт
# пробрасывается как ${POSTGRES_PORT}:5432, а POSTGRES_PORT используется ещё и
# внутри сервисов — env'ом не перепривяжешь, поэтому override с тегом !override
# (замена списка ports целиком; нужен docker compose >= 2.24.4).
cat > docker-compose.override.yml <<'YAML'
# Veloseller: внешние порты только на loopback. Официальный compose не патчим.
services:
  supavisor:
    ports: !override
      - 127.0.0.1:5432:5432
      - 127.0.0.1:6543:6543
YAML

if ! docker compose config -q 2>/dev/null; then
  echo "!! docker compose не понял override (!override требует compose >= 2.24.4)."
  echo "!! Убираю loopback-override — ПРОВЕРЬ, что ufw закрывает 5432/6543 снаружи!"
  rm -f docker-compose.override.yml
  sed -i 's|^COMPOSE_FILE=.*|COMPOSE_FILE=docker-compose.yml:docker-compose.pg17.yml|' .env
  docker compose config -q
fi

echo "==> Поднимаю сервисы: $SERVICES"
docker compose pull $SERVICES
docker compose up -d $SERVICES

echo
echo "==> Готово. Проверка: curl -s http://127.0.0.1:8000/auth/v1/health"
echo "==> Ключи в $TARGET/docker/.env — сделай копию в надёжное место."
echo "==> Дальше: deploy/supabase/nginx-supabase.conf + certbot, затем migrate-from-cloud.sh"
