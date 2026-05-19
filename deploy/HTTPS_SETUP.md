# Veloseller HTTPS setup

Пошаговая инструкция как поставить HTTPS на `veloseller.ru` через Let's Encrypt.

## Pre-requisites

- Домен `veloseller.ru` куплен и DNS A-запись указывает на `185.221.215.215`
- VPS работает, nginx уже стоит и обслуживает HTTP на 80 порту
- Email-адрес для уведомлений Let's Encrypt (`igor1000rr@gmail.com`)

## Проверка DNS перед началом

С windows:
```powershell
nslookup veloseller.ru
nslookup www.veloseller.ru
```

Должно показать `185.221.215.215`. Если показывает старый IP/Hostland-парковку — подожди распространения DNS (обычно 5-60 минут, иногда до 24 часов).

## Запуск через VNC консоль (раз SSH ключа на windows нет)

1. Зайди в личный кабинет [Hostland](https://www.hostland.ru) → твой VPS → **«Консоль»** или **«VNC»**
2. Логинься как `root` (пароль от VPS — давали при заказе)
3. Выполни:

```bash
# Если репо ещё не подтянуто на VPS:
cd /opt && [ -d veloseller ] || git clone https://github.com/igor1000rr/Veloseller-.git veloseller

# Подтягиваем последние изменения
cd /opt/veloseller && git pull origin main

# Запускаем HTTPS setup
bash /opt/veloseller/deploy/setup-https.sh
```

Скрипт сделает всё сам:
- Установит certbot
- Получит сертификат для `veloseller.ru` и `www.veloseller.ru`
- Подменит nginx config на HTTPS-версию
- Перезагрузит nginx
- Настроит auto-renewal (certbot.timer)

## Проверка после

```bash
# Должен показать 200 OK
curl -I https://veloseller.ru/

# Проверка качества SSL
# Открой в браузере: https://www.ssllabs.com/ssltest/analyze.html?d=veloseller.ru
# Должен быть рейтинг A или A+
```

## Что делать дальше

После успешной установки HTTPS:

1. **Supabase Auth URL Configuration** (Dashboard → Authentication → URL Configuration):
   - Site URL: `https://veloseller.ru`
   - Redirect URLs добавить: `https://veloseller.ru/auth/callback`

2. **Telegram bot webhook** (если бот настроен):
   ```bash
   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://veloseller.ru/telegram/webhook"
   ```

3. **Stripe webhook** (когда перейдёшь на live mode):
   - Stripe Dashboard → Developers → Webhooks → Add endpoint
   - URL: `https://veloseller.ru/api/stripe/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `invoice.payment_failed`

4. **Update environment**:
   - `.env.local` web-приложения: `NEXT_PUBLIC_SITE_URL=https://veloseller.ru`
   - Перезапустить web сервис

## Renewal

Certbot ставит cron автоматически (`/etc/cron.d/certbot` или через `certbot.timer`). Проверка:

```bash
systemctl status certbot.timer
sudo certbot renew --dry-run    # тестовый прогон renewal
```

Сертификаты Let's Encrypt живут 90 дней, certbot обновляет за 30 дней до истечения.

## Troubleshooting

**"DNS for veloseller.ru does not resolve"** — подожди 5-60 минут после смены A-записи.

**"nginx: configuration test failed"** — посмотри `/etc/nginx/sites-enabled/` и удали старые конфиги:
```bash
rm /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

**"certbot --nginx ругается что не находит server_name"** — значит у тебя ещё старый `server_name _` в конфиге. Сначала подмени конфиг **вручную** (без HTTPS-блока):
```bash
# Открой /etc/nginx/sites-enabled/veloseller и измени
#   server_name _;
# на
#   server_name veloseller.ru www.veloseller.ru;
# затем nginx -t && systemctl reload nginx
# и запускай setup-https.sh ещё раз
```
