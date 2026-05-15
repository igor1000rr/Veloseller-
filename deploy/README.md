# Veloseller — как переустановить VPS защищённо

## TL;DR

```bash
# Берёшь свежий Ubuntu 24.04 VPS из панели Hostland.
# До первого SSH-входа подготовь локально:
ssh-keygen -t ed25519 -C "igor@veloseller"          # если ещё нет
cat ~/.ssh/id_ed25519.pub                            # скопируй

# Подключаешься первый раз по паролю root из панели Hostland:
ssh root@<NEW_IP>

# На VPS:
export ADMIN_SSH_KEY="ssh-ed25519 AAAA... igor@veloseller"   # вставь свой публичный
export ADMIN_IP="<твой текущий IP>"                        # https://ipinfo.io — поле IP
curl -sSL https://raw.githubusercontent.com/igor1000rr/Veloseller-/main/deploy/secure-bootstrap.sh | bash

# Скрипт:
#  • Обновит систему, поставит Node 22, Python 3.12, nginx
#  • Создаст user veloseller с твоим ссх-ключом
#  • Отключит парольный вход, root login только по ключу
#  • Включит fail2ban, ufw, unattended-upgrades
#  • Настроит nginx с rate-limit и блокировкой сканеров
#  • Клонирует репо в /opt/veloseller

# Дальше:
passwd root                                          # смени root на длинный рандом
```

## После bootstrap

### 1. Ротируем Supabase ключи

Dashboard → Settings → API → **Reset** для `service_role` (и `anon`).

### 2. Заполняем секреты

```bash
sudo -u veloseller cp /opt/veloseller/deploy/env.web.example     /opt/veloseller/apps/web/.env.production
sudo -u veloseller cp /opt/veloseller/deploy/env.worker.example  /opt/veloseller/apps/worker/.env
sudo -u veloseller nano /opt/veloseller/apps/web/.env.production    # вставь НОВЫЕ Supabase ключи
sudo -u veloseller nano /opt/veloseller/apps/worker/.env
chmod 600 /opt/veloseller/apps/web/.env.production /opt/veloseller/apps/worker/.env
```

### 3. Билд + запуск

```bash
sudo -u veloseller bash /opt/veloseller/deploy/finalize.sh
```

`finalize.sh` из репо: npm ci, pip install, npm run build, systemctl restart веб+воркер.

### 4. GitHub Actions secret — новый deploy key

Старый SSH-ключ для CI/CD лежал на старом VPS и мог быть виден атакующему.
Генерируем новый:

```bash
# На VPS:
sudo -u veloseller ssh-keygen -t ed25519 -f /home/veloseller/.ssh/github_deploy -N "" \
  -C "github-actions-deploy@veloseller-$(date +%Y%m%d)"
cat /home/veloseller/.ssh/github_deploy.pub >> /home/veloseller/.ssh/authorized_keys
cat /home/veloseller/.ssh/github_deploy   # PRIVATE ключ — скопируй
```

GitHub → Settings → Secrets → `DEPLOY_SSH_KEY` → вставь НОВЫЙ private.
После этого старый ключ становится невалидным (в авторизед ключах его нет).

## Что изменилось по безопасности

| Было | Стало |
|---|---|
| `PermitRootLogin yes` + пароль | Только SSH-ключ, пароль отключён |
| Next.js 15.0.3 (CVE-2025-66478 RCE, CVSS 10.0) | Next.js 15.0.7 (все RCE и CVE до май-2026 закрыты) |
| `proxy_buffers` default 4k → 502 | 16k/8×16k |
| Нет rate-limit | 30 req/s general, 10/s api, 3/s login |
| Нет scanner-блока | Shodan/zgrab/wp-admin/boaform → 444 |
| Нет fail2ban | SSH-jail: 3 fail = 1h бан |
| Нет авто-патчей | unattended-upgrades включён |

## Диагностика после запуска

```bash
ufw status                              # должно быть active, deny incoming
fail2ban-client status sshd             # banned IPs
systemctl status veloseller-web veloseller-worker --no-pager
curl -I http://127.0.0.1:3000           # Next.js Ready
curl -I http://localhost/health         # через nginx
ss -ltnp | grep -E ':(22|80|443|3000|8001)'
```
