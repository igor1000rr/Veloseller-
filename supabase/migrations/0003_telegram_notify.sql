-- Veloseller: Telegram chat_id для уведомлений + флаги настроек уведомлений
alter table sellers add column if not exists telegram_chat_id text;
alter table sellers add column if not exists notify_email boolean not null default true;
alter table sellers add column if not exists notify_telegram boolean not null default true;
