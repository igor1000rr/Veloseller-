-- robokassa_invoices.plan CHECK не знал про тариф «Конструктор» (custom_{wh}x{sku},
-- добавлен в код 04.06.2026), из-за чего INSERT инвойса для конструктора падал на
-- констрейнте → /api/robokassa/create-payment отдавал 500 «Не удалось создать заявку».
-- Фикс-тарифы (starter/growth/pro/radar_*) проходили — ломался только конструктор.
--
-- Разрешаем фикс-список ИЛИ паттерн custom_{1-2 цифры}x{4-5 цифр} (как в lib/custom-plan.ts:
-- /^custom_\d{1,2}x\d{4,5}$/). Точные диапазоны/шаг валидирует приложение перед вставкой.
-- sellers.plan CHECK отсутствует, активация custom-плана в sellers не блокируется.
--
-- Применено на прод напрямую (на self-hosted нет supabase_migrations runner); файл — для записи.
ALTER TABLE public.robokassa_invoices
  DROP CONSTRAINT IF EXISTS robokassa_invoices_plan_check,
  ADD CONSTRAINT robokassa_invoices_plan_check CHECK (
    plan = ANY (ARRAY['starter','growth','pro','radar_start','radar_seller','radar_pro','radar_expert']::text[])
    OR plan ~ '^custom_[0-9]{1,2}x[0-9]{4,5}$'
  );
