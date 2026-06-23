-- Паритет get_skus_period_metrics (on-the-fly RPC SKU-листа) ↔ канонические метрики
-- воркера в tvelo_metrics. Регрессия-чек аудита C3.2.
--
-- ЗАЧЕМ. SKU-лист за произвольный период считает метрики НА ЛЕТУ этим RPC, а ночной
-- воркер пишет канонические в tvelo_metrics через app/engine. Чек подтверждает, что
-- пути не разъехались. Парный CI-тест на формулы: apps/worker/tests/test_period_metrics_parity.py
-- (он фиксирует алгебру; этот .sql — поведение на реальных данных, т.к. SQL RPC в CI не запустить).
--
-- ЗАПУСК (нужна БД с данными — прод/стейдж, не CI):
--   psql "$DATABASE_URL" -f supabase/tests/get_skus_period_metrics_parity.sql
--   либо через MCP execute_sql (read-only).
--
-- ИНВАРИАНТЫ (что считать прохождением):
--   ЖЁСТКИЙ  — n_isd_mismatch = 0 И n_sod_mismatch = 0. Счёт дней (in_stock/stockout)
--              детерминирован; ЛЮБОЕ расхождение здесь = реальный баг (RPC и движок
--              по-разному считают дни). На проде 2026-06: 0/1883.
--   МЯГКИЙ   — pct_vel_match ≥ 95%. velocity = consumption/in_stock_days; небольшой
--              остаток расходится, т.к. confirmed-consumption воркера проходит
--              классификацию событий (recount/anomaly), а RPC берёт сырой
--              SUM(ABS(delta_stock)) по sales_like. Это осознанный trade-off скорости
--              on-the-fly расчёта, НЕ баг. На проде 2026-06: ~98.4% (1852/1883), на
--              1-3 ед. потребления. Резкое падение pct_vel_match = повод разбираться.
--
-- Окно: последнее ОСЁДШЕЕ 30-дн (period_end ≤ today-3 — без дрейфа живых событий
-- в незакрытый период), у селлера с наибольшим числом строк.

WITH target AS (
  SELECT p.seller_id, p.connection_id, tm.period_start AS p_start, tm.period_end AS p_end
  FROM tvelo_metrics tm
  JOIN products p ON p.product_id = tm.product_id
  WHERE (tm.period_end - tm.period_start) = 29
    AND tm.period_end <= CURRENT_DATE - 3
  GROUP BY p.seller_id, p.connection_id, tm.period_start, tm.period_end
  ORDER BY tm.period_end DESC, count(*) DESC
  LIMIT 1
),
canon AS (
  SELECT tm.product_id, tm.confirmed_velocity, tm.in_stock_days, tm.stockout_days
  FROM tvelo_metrics tm
  JOIN products p ON p.product_id = tm.product_id
  JOIN target t ON p.seller_id = t.seller_id
    AND p.connection_id IS NOT DISTINCT FROM t.connection_id
  WHERE tm.period_start = t.p_start AND tm.period_end = t.p_end
),
rpc AS (
  SELECT g.product_id, g.velocity, g.in_stock_days, g.stockout_days
  FROM target t,
    LATERAL get_skus_period_metrics(
      t.seller_id, t.connection_id, t.p_start, t.p_end,
      ARRAY(SELECT product_id FROM canon)
    ) g
),
cmp AS (
  SELECT
    c.product_id,
    abs(COALESCE(c.confirmed_velocity, 0) - COALESCE(r.velocity, 0)) AS vel_diff,
    (c.in_stock_days  IS DISTINCT FROM r.in_stock_days)  AS isd_mismatch,
    (c.stockout_days  IS DISTINCT FROM r.stockout_days)  AS sod_mismatch
  FROM canon c
  JOIN rpc r ON r.product_id = c.product_id
)
SELECT
  (SELECT p_start FROM target) AS window_start,
  (SELECT p_end   FROM target) AS window_end,
  count(*)                                              AS n_products,
  count(*) FILTER (WHERE isd_mismatch)                  AS n_isd_mismatch,   -- ЖЁСТКИЙ: должно быть 0
  count(*) FILTER (WHERE sod_mismatch)                  AS n_sod_mismatch,   -- ЖЁСТКИЙ: должно быть 0
  count(*) FILTER (WHERE vel_diff > 1e-6)               AS n_vel_mismatch,
  round(100.0 * count(*) FILTER (WHERE vel_diff <= 1e-6) / NULLIF(count(*), 0), 2) AS pct_vel_match,  -- МЯГКИЙ: ≥ 95
  round(max(vel_diff)::numeric, 6)                      AS max_abs_vel_diff
FROM cmp;
