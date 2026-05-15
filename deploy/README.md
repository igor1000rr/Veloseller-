# Veloseller — deploy README

Пошаговый deploy на чистый Ubuntu 22.04+ сервер (185.221.215.215).

## Шаг 1. SSH на сервер

```
ssh root@185.221.215.215
# пароль — тот что выдал хостинг
```

## Шаг 2. Бутстрап сервера

```bash
# Скачиваем репо и запускаем bootstrap
cd /tmp
git clone https://github.com/igor1000rr/Veloseller-.git
cd Veloseller-/deploy
chmod +x setup-server.sh finalize.sh
bash setup-server.sh veloseller.your-domain.com
```

## Шаг 3. SSH-ключ для GitHub Actions

На СВОЁМ компьютере:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/veloseller_deploy -N ""
# Это создаст два файла:
#   ~/.ssh/veloseller_deploy        — PRIVATE (в GitHub Secrets)
#   ~/.ssh/veloseller_deploy.pub    — PUBLIC (на сервер)
```

На сервере — добавить public в authorized_keys пользователя veloseller:

```bash
# Скопировать содержимое veloseller_deploy.pub и вставить ниже
nano /home/veloseller/.ssh/authorized_keys
chown veloseller:veloseller /home/veloseller/.ssh/authorized_keys
chmod 600 /home/veloseller/.ssh/authorized_keys
```

В GitHub репо → Settings → Secrets and variables → Actions → New secret:

  * `DEPLOY_HOST` = `185.221.215.215`
  * `DEPLOY_USER` = `veloseller`
  * `DEPLOY_SSH_KEY` = всё содержимое PRIVATE файла `veloseller_deploy`

## Шаг 4. Наполнить .envфайлы

На сервере под root:

```bash
cp /opt/veloseller/deploy/env.web.example /opt/veloseller/apps/web/.env.production
cp /opt/veloseller/deploy/env.worker.example /opt/veloseller/apps/worker/.env

# Отредактировать оба — подставить реальные ключи
nano /opt/veloseller/apps/web/.env.production
nano /opt/veloseller/apps/worker/.env

# Права (не пускать других)
chmod 600 /opt/veloseller/apps/web/.env.production /opt/veloseller/apps/worker/.env
chown veloseller:veloseller /opt/veloseller/apps/web/.env.production /opt/veloseller/apps/worker/.env
```

## Шаг 5. Сборка + запуск

```bash
bash /opt/veloseller/deploy/finalize.sh veloseller.your-domain.com
```

Это сделает `npm run build` для Next.js + запустит оба сервиса + выдаст SSL (если DNS настроен).

## Шаг 6. Отключить root SSH

```bash
passwd -l root
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd
```

## Шаг 7. Проверить

```bash
systemctl status veloseller-web
systemctl status veloseller-worker
curl http://localhost:3000  # Next.js
curl http://localhost:8001/health  # worker

# logs
journalctl -u veloseller-web -f
journalctl -u veloseller-worker -f
```

## Автодеплой

После Шага 3 (SSH-ключ в secrets) — каждый `git push origin main` автоматически:

1. запускает все тесты (worker + web)
2. если зелёные — SSH'ит на сервер, делает `git pull && npm install && npm run build && systemctl restart`

Workflow: `.github/workflows/deploy.yml`.
