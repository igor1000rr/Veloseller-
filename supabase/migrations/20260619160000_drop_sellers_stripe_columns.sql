-- Удаляю неиспользуемые Stripe-колонки из sellers.
-- Stripe-подсистема вырезана из кода: платежи идут только через Robokassa.
-- Частичный индекс idx_sellers_stripe_customer удалится автоматически вместе с колонкой.
alter table public.sellers drop column if exists stripe_customer_id;
alter table public.sellers drop column if exists stripe_subscription_id;
