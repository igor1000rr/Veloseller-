# Veloseller — пошаговый deploy на VPS

## Шаг 0. Локально (разово, если ещё нет SSH-ключа)

```cmd
ssh-keygen -t ed25519 -C "igor@veloseller"
type %USERPROFILE%\.ssh\id_ed25519.pub
```
Скопируй публичный ключ (`ssh-ed25519 AAAA... igor@veloseller`).

Узнай свой IP: https://ipinfo.io → поле IP.

## Шаг 1. Свежий VPS из Hostland

В панели → переустановка → Ubuntu 24.04. Получишь новый root-пароль.

## Шаг 2. Bootstrap (10-15 мин)

```bash
ssh root@<NEW_IP>
# пароль из панели

# Подставь свои значения:
export ADMIN_SSH_KEY="ssh-ed25519 AAAA... igor@veloseller"
export ADMIN_IP="37.214.205.51"

curl -sSL https://raw.githubusercontent.com/igor1000rr/Veloseller-/main/deploy/secure-bootstrap.sh | bash
```

Скрипт на конце выведет:
- Путь к `/root/veloseller-secrets.txt` (там сгенерированы WORKER_SECRET и SECRET_ENCRYPTION_KEY)
- Инструкцию что делать дальше

## Шаг 3. ПРОВЕРЬ что SSH-ключ работает(!)

Не закрывая root-сессию, открой НОВОЕ окно cmd и:
```cmd
ssh veloseller@<IP>
```
Должно пустить БЕЗ пароля. Если не пустил — НЕ иди дальше, разберись.

## Шаг 4. Supabase секреты

Dashboard: https://supabase.com/dashboard/project/pptetnhdmxehijslbsrx/settings/api-keys

Возьми:
- `publishable_key` → `sb_publishable_J4r40...`
- `secret_key` → `sb_secret_x9Hal...`

## Шаг 5. Создай .env-файлы (под veloseller)

```bash
ssh veloseller@<IP>

# Из сгенерированных секретов:
sudo cat /root/veloseller-secrets.txt
# (запиши WORKER_SECRET и SECRET_ENCRYPTION_KEY)

# web .env.production:
cat > /opt/veloseller/apps/web/.env.production <<'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://pptetnhdmxehijslbsrx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<sb_publishable_...>
SUPABASE_SERVICE_ROLE_KEY=<sb_secret_...>
WORKER_URL=http://127.0.0.1:8001
WORKER_SECRET=<из secrets.txt>
SECRET_ENCRYPTION_KEY=<из secrets.txt>
ADMIN_EMAILS=igor1000rr@gmail.com
NEXT_PUBLIC_APP_URL=http://<IP>
EOF

# worker .env:
cat > /opt/veloseller/apps/worker/.env <<'EOF'
SUPABASE_URL=https://pptetnhdmxehijslbsrx.supabase.co
SUPABASE_SERVICE_KEY=<sb_secret_...>
WORKER_SECRET=<из secrets.txt>
SECRET_ENCRYPTION_KEY=<из secrets.txt>
SCHEDULER_TIMEZONE=Europe/Warsaw
EOF

chmod 600 /opt/veloseller/apps/web/.env.production /opt/veloseller/apps/worker/.env
```

Stripe / Telegram / Resend пока можно пропустить — добавишь позже.

## Шаг 6. Деплой (5-10 мин)

```bash
sudo /opt/veloseller/deploy/finalize.sh
```

`finalize.sh` самостоятельно:
- `npm ci` в корне монорепо
- `python -m venv` + `pip install` для worker
- `npm run build` в apps/web
- Рестарт обоих сервисов
- Проверяет что Next.js отвечает на :3000

Сайт жив: http://<IP>/

## Шаг 7. Закрыть SSH (ТОЛЬКО ПОСЛЕ ПРОВЕРКИ!)

```bash
sudo /opt/veloseller/deploy/harden-ssh.sh
```

Скрипт потребует явно написать `YES` и проверит что в authorized_keys всё на месте.

## Диагностика

```bash
systemctl status veloseller-web veloseller-worker --no-pager
journalctl -u veloseller-web -n 50 --no-pager
ufw status
fail2ban-client status sshd
curl -I http://127.0.0.1:3000
curl -I http://localhost/
```
