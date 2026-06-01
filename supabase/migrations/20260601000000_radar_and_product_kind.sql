-- ============================================================================
-- Veloseller: Radar-схема + product_kind — миграция от 01.06.2026
-- ============================================================================
-- Назначение: довести committed-схему до состояния, которое РЕАЛЬНО ожидает код:
--   apps/worker/app/radar/*  (api.py, wordstat_provider.py, wordstat_matcher.py)
--   apps/worker/app/jobs/radar.py, radar_digest.py
--   apps/web/app/api/radar/*  (upload/queries/brands)
--   apps/web/app/api/robokassa/*  (create-payment, result)
--
-- В снапшоте 20260522000000 этих объектов нет, хотя код их использует. Более
-- того, старый CHECK на robokassa_invoices.plan ('starter','growth','pro')
-- ПРЯМО отвергает radar_*-планы, которые вставляет create-payment.
--
-- Восстановлено по коду:
--   on_conflict-ключи  → UNIQUE-индексы (иначе .upsert() падает в рантайме)
--   значения status    → CHECK по фактически записываемым значениям
--
-- Идемпотентна (IF NOT EXISTS / guarded DO-блоки) — безопасна, даже если часть
-- объектов уже создана вручную в Dashboard.
--
-- ВНИМАНИЕ: если radar-схема УЖЕ накатана в прод вручную — источником истины
-- является прод. Тогда правильнее зафиксировать его через `supabase db pull`,
-- а этот файл использовать как сверочный эталон (что код требует) и как
-- готовую миграцию для свежих/dev-окружений.
-- ============================================================================


-- 1. sellers: поля подписки Radar --------------------------------------------
ALTER TABLE public.sellers
  ADD COLUMN IF NOT EXISTS radar_plan         text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS radar_brands_limit integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS radar_active_until timestamptz;

-- result/route.ts пишет короткую форму: 'start'/'seller'/'pro'/'expert'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sellers_radar_plan_check') THEN
    ALTER TABLE public.sellers
      ADD CONSTRAINT sellers_radar_plan_check
      CHECK (radar_plan IN ('none','start','seller','pro','expert'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sellers_radar_active
  ON public.sellers(radar_active_until)
  WHERE radar_plan <> 'none';


-- 2. robokassa_invoices: product_kind + расширение CHECK(plan) ----------------
ALTER TABLE public.robokassa_invoices
  ADD COLUMN IF NOT EXISTS product_kind text NOT NULL DEFAULT 'veloseller';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'robokassa_invoices_product_kind_check') THEN
    ALTER TABLE public.robokassa_invoices
      ADD CONSTRAINT robokassa_invoices_product_kind_check
      CHECK (product_kind IN ('veloseller','radar'));
  END IF;
END $$;

-- старый inline-CHECK (robokassa_invoices_plan_check) запрещал radar_*-планы
ALTER TABLE public.robokassa_invoices
  DROP CONSTRAINT IF EXISTS robokassa_invoices_plan_check;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'robokassa_invoices_plan_allowed') THEN
    ALTER TABLE public.robokassa_invoices
      ADD CONSTRAINT robokassa_invoices_plan_allowed
      CHECK (plan IN (
        'starter','growth','pro',
        'radar_start','radar_seller','radar_pro','radar_expert'
      ));
  END IF;
END $$;


-- 3. radar_brands ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.radar_brands (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id        uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  name             text NOT NULL,
  name_normalized  text NOT NULL,
  source           text NOT NULL DEFAULT 'price',
  status           text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved','excluded')),
  sku_count        integer NOT NULL DEFAULT 0,
  last_wordstat_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
-- on_conflict="seller_id,name_normalized" в api.py
CREATE UNIQUE INDEX IF NOT EXISTS radar_brands_seller_name_key
  ON public.radar_brands(seller_id, name_normalized);
CREATE INDEX IF NOT EXISTS idx_radar_brands_seller_status
  ON public.radar_brands(seller_id, status);


-- 4. radar_price_models ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.radar_price_models (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id    uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  model_token  text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- on_conflict="seller_id,model_token"
CREATE UNIQUE INDEX IF NOT EXISTS radar_price_models_seller_token_key
  ON public.radar_price_models(seller_id, model_token);


-- 5. radar_price_uploads -----------------------------------------------------
-- web вставляет status='processing'; worker → 'completed'/'failed'
CREATE TABLE IF NOT EXISTS public.radar_price_uploads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id        uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  file_name        text,
  file_size_bytes  bigint,
  file_hash        text,
  status           text NOT NULL DEFAULT 'processing'
                     CHECK (status IN ('processing','completed','failed')),
  error_message    text,
  rows_total       integer,
  ai_provider      text,
  ai_model         text,
  ai_input_tokens  integer,
  ai_output_tokens integer,
  ai_cost_usd      numeric(12,6),
  brands_extracted integer NOT NULL DEFAULT 0,
  brands_approved  integer NOT NULL DEFAULT 0,
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_radar_uploads_seller
  ON public.radar_price_uploads(seller_id, created_at DESC);


-- 6. radar_queries -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.radar_queries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id         uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  brand_id          uuid NOT NULL REFERENCES public.radar_brands(id) ON DELETE CASCADE,
  query_text        text NOT NULL,
  query_normalized  text NOT NULL,
  current_frequency integer NOT NULL DEFAULT 0,
  trend_pct         numeric(8,1),
  present_in_wb     boolean,   -- v2: не используется (suggest убран), оставлено nullable
  present_in_ozon   boolean,   -- v2: не используется
  status            text NOT NULL DEFAULT 'new' CHECK (status IN ('new','watching','archived')),
  is_favorite       boolean NOT NULL DEFAULT false,
  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  last_updated_at   timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);
-- poller ищет/дедупит по (seller_id, brand_id, query_normalized)
CREATE UNIQUE INDEX IF NOT EXISTS radar_queries_seller_brand_query_key
  ON public.radar_queries(seller_id, brand_id, query_normalized);
CREATE INDEX IF NOT EXISTS idx_radar_queries_seller_status
  ON public.radar_queries(seller_id, status, current_frequency DESC);


-- 7. radar_query_history -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.radar_query_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id     uuid NOT NULL REFERENCES public.radar_queries(id) ON DELETE CASCADE,
  period_year  integer NOT NULL,
  period_month integer NOT NULL,
  frequency    integer NOT NULL DEFAULT 0,
  captured_at  timestamptz NOT NULL DEFAULT now()
);
-- on_conflict="query_id,period_year,period_month"
CREATE UNIQUE INDEX IF NOT EXISTS radar_query_history_period_key
  ON public.radar_query_history(query_id, period_year, period_month);


-- 8. radar_cache (глобальный кэш Wordstat, НЕ per-seller) --------------------
CREATE TABLE IF NOT EXISTS public.radar_cache (
  cache_key  text PRIMARY KEY,           -- on_conflict="cache_key"
  provider   text,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_radar_cache_expires
  ON public.radar_cache(expires_at);


-- 9. radar_actions (лог действий; используется для дедупа digest_sent) -------
CREATE TABLE IF NOT EXISTS public.radar_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id   uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_radar_actions_seller_type_date
  ON public.radar_actions(seller_id, action_type, created_at DESC);


-- 10. updated_at-триггеры (переиспользуем public.set_updated_at из снапшота) --
DROP TRIGGER IF EXISTS trg_radar_brands_updated_at ON public.radar_brands;
CREATE TRIGGER trg_radar_brands_updated_at
  BEFORE UPDATE ON public.radar_brands
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_radar_cache_updated_at ON public.radar_cache;
CREATE TRIGGER trg_radar_cache_updated_at
  BEFORE UPDATE ON public.radar_cache
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- 11. view radar_queries_view (radar_queries + brand_name) -------------------
-- radar_digest.py читает radar_queries_view и берёт item["brand_name"].
-- security_invoker=true → RLS подлежащих таблиц применяется к вызывающему юзеру.
DROP VIEW IF EXISTS public.radar_queries_view;
CREATE VIEW public.radar_queries_view WITH (security_invoker = true) AS
SELECT
  q.*,
  b.name            AS brand_name,
  b.name_normalized AS brand_name_normalized
FROM public.radar_queries q
JOIN public.radar_brands  b ON b.id = q.brand_id;


-- 12. RLS --------------------------------------------------------------------
-- Worker ходит под service_role → RLS он обходит. Политики нужны для доступа
-- пользователя из браузера (server client под анон-ключом + JWT).
ALTER TABLE public.radar_brands        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_price_models  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_price_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_queries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_query_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_actions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_cache         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS radar_brands_owner ON public.radar_brands;
CREATE POLICY radar_brands_owner ON public.radar_brands FOR ALL
  USING (seller_id = (select auth.uid())) WITH CHECK (seller_id = (select auth.uid()));

DROP POLICY IF EXISTS radar_price_models_owner ON public.radar_price_models;
CREATE POLICY radar_price_models_owner ON public.radar_price_models FOR ALL
  USING (seller_id = (select auth.uid())) WITH CHECK (seller_id = (select auth.uid()));

DROP POLICY IF EXISTS radar_price_uploads_owner ON public.radar_price_uploads;
CREATE POLICY radar_price_uploads_owner ON public.radar_price_uploads FOR ALL
  USING (seller_id = (select auth.uid())) WITH CHECK (seller_id = (select auth.uid()));

DROP POLICY IF EXISTS radar_queries_owner ON public.radar_queries;
CREATE POLICY radar_queries_owner ON public.radar_queries FOR ALL
  USING (seller_id = (select auth.uid())) WITH CHECK (seller_id = (select auth.uid()));

DROP POLICY IF EXISTS radar_actions_owner ON public.radar_actions;
CREATE POLICY radar_actions_owner ON public.radar_actions FOR ALL
  USING (seller_id = (select auth.uid())) WITH CHECK (seller_id = (select auth.uid()));

-- history: владение через родительский radar_queries (своей колонки seller_id нет)
DROP POLICY IF EXISTS radar_query_history_owner ON public.radar_query_history;
CREATE POLICY radar_query_history_owner ON public.radar_query_history FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.radar_queries q
    WHERE q.id = radar_query_history.query_id
      AND q.seller_id = (select auth.uid())
  ));

-- radar_cache: глобальный кэш. RLS включён, политик НЕТ → anon/authenticated
-- не имеют доступа (default deny). Доступ только worker под service_role.

-- ============================================================================
-- КОНЕЦ МИГРАЦИИ
-- ============================================================================
