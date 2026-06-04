import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSelectedWarehouse } from "@/lib/warehouse";
import { getPreHolidayWindow } from "@/lib/holidays";
import { buildHealthBreakdown, buildConfidenceBreakdown } from "../[id]/HealthTooltip";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * ВРЕМЕННАЯ диагностика прод-инцидента «Application error, Digest: 801888437»
 * на /dashboard/skus и карточке SKU.
 *
 * Прод-Next прячет стек за digest, доступа к journalctl из этой сессии нет —
 * поэтому страница повторяет data-фазу списка и карточки шаг за шагом,
 * каждый шаг в try/catch, и показывает где именно бросается исключение
 * (плюс supabase error.message, которые основной код молча проглатывает).
 *
 * После диагностики роут удаляется.
 */

type Step = { name: string; ok: boolean; info?: string; error?: string };

function DiagView({ steps }: { steps: Step[] }) {
  return (
    <div className="p-6 max-w-4xl mx-auto font-mono text-sm">
      <h1 className="text-lg font-semibold mb-4">SKU diag — временная страница</h1>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={i} className={s.ok ? "text-green-700" : "text-red-700"}>
            <div>{s.ok ? "✅" : "❌"} {s.name}</div>
            {s.info && <div className="text-slate-600 whitespace-pre-wrap">{s.info}</div>}
            {s.error && (
              <pre className="mt-1 p-2 bg-red-50 border border-red-200 rounded whitespace-pre-wrap break-all">{s.error}</pre>
            )}
          </li>
        ))}
      </ol>
      <p className="mt-6 text-slate-500">
        Если все шаги ✅, а /dashboard/skus всё равно падает — исключение живёт в рендере компонентов, шлите скрин, сужаем дальше.
      </p>
    </div>
  );
}

export default async function SkusDiagPage() {
  const steps: Step[] = [];
  let fatal = false;

  async function step<T>(name: string, fn: () => Promise<[T, string]>): Promise<T | undefined> {
    if (fatal) {
      steps.push({ name, ok: false, error: "пропущен — предыдущий шаг упал" });
      return undefined;
    }
    try {
      const [v, info] = await fn();
      steps.push({ name, ok: true, info });
      return v;
    } catch (e: any) {
      fatal = true;
      steps.push({
        name,
        ok: false,
        error: `${e?.name ?? "Error"}: ${e?.message ?? String(e)}\n${String(e?.stack ?? "").slice(0, 1500)}`,
      });
      return undefined;
    }
  }

  const supabase = await createSupabaseServerClient();

  const user = await step("auth.getUser", async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw new Error("нет сессии — войдите в аккаунт и откройте /dashboard/skus/diag снова");
    return [data.user, `user=${data.user.id.slice(0, 8)}…`] as [typeof data.user, string];
  });
  if (!user) return <DiagView steps={steps} />;

  const selected = await step("getSelectedWarehouse", async () => {
    const s = await getSelectedWarehouse(supabase, user.id);
    return [s, s ? `${s.name} (${s.warehouse_kind}), created_at=${s.created_at}` : "складов нет (null)"] as [
      Awaited<ReturnType<typeof getSelectedWarehouse>>,
      string,
    ];
  });

  await step("getPreHolidayWindow(today)", async () => {
    const p = getPreHolidayWindow(new Date());
    return [p, p ? JSON.stringify(p) : "null — окно неактивно"] as [any, string];
  });

  await step("rpc get_skus_filter_ranges", async () => {
    const res = await supabase.rpc("get_skus_filter_ranges", {
      p_seller_id: user.id,
      p_connection_id: selected?.id ?? null,
      p_period_days: 30,
    });
    return [
      res.data,
      res.error ? `supabase error: ${res.error.message}` : `rows=${(res.data as any[] | null)?.length ?? 0}`,
    ] as [any, string];
  });

  const products = await step("products + tvelo_metrics!inner (range 0–49)", async () => {
    let q = supabase
      .from("products")
      .select(
        `
      product_id, sku, product_name, user_notes,
      tvelo_metrics!inner (
        confirmed_velocity, adjusted_velocity, median_30d_velocity, confidence_score,
        stockout_days, in_stock_days, coverage_days, current_stock,
        current_price, inventory_segment, sku_health_score, underestimated_sku,
        period_start, period_end
      )
    `,
        { count: "exact" },
      )
      .eq("seller_id", user.id);
    if (selected) q = q.eq("connection_id", selected.id);
    q = q.or("current_stock.gt.0,adjusted_velocity.gt.0", { foreignTable: "tvelo_metrics" });
    const { data, count, error } = await q.order("sku").range(0, 49);
    return [
      (data ?? []) as any[],
      error ? `supabase error: ${error.message}` : `rows=${data?.length ?? 0}, count=${count}`,
    ] as [any[], string];
  });

  const ids = (products ?? []).map((p: any) => p.product_id);

  await step("история tvelo_metrics (.in productIds, без limit)", async () => {
    if (ids.length === 0) return [null, "пропуск — products пуст"] as [any, string];
    const { data, error } = await supabase
      .from("tvelo_metrics")
      .select("product_id,adjusted_velocity,period_end")
      .in("product_id", ids)
      .order("period_end", { ascending: true });
    return [data, error ? `supabase error: ${error.message}` : `rows=${data?.length ?? 0}`] as [any, string];
  });

  const filtered = await step("map matchedMetric (new Date математика списка)", async () => {
    const f = (products ?? []).map((p: any) => {
      const metrics = (p.tvelo_metrics as any[] | undefined) ?? [];
      const matched =
        metrics.find((m) => {
          const len = Math.round(
            (new Date(m.period_end).getTime() - new Date(m.period_start).getTime()) / 86400_000,
          );
          return Math.abs(len - 29) <= 1;
        }) ?? metrics[0];
      return { ...p, tvelo_metrics: matched ? [matched] : [] };
    });
    return [f, `filtered=${f.length}`] as [any[], string];
  });

  await step("inventory_events sales_like за период первой метрики", async () => {
    const firstM = (filtered ?? [])[0]?.tvelo_metrics?.[0];
    if (!firstM?.period_start || !firstM?.period_end) return [null, "пропуск — нет метрик"] as [any, string];
    const { data, error } = await supabase
      .from("inventory_events")
      .select("product_id, delta_stock")
      .in("product_id", (filtered ?? []).map((p: any) => p.product_id))
      .eq("event_type", "sales_like")
      .gte("event_date", firstM.period_start)
      .lte("event_date", firstM.period_end);
    return [data, error ? `supabase error: ${error.message}` : `rows=${data?.length ?? 0}`] as [any, string];
  });

  const pid = (filtered ?? [])[0]?.product_id as string | undefined;

  const detail = await step("карточка: 5 запросов Promise.all (первый SKU)", async () => {
    if (!pid) return [null, "пропуск — нет product_id"] as [any, string];
    const day60Ago = new Date(Date.now() - 60 * 86400_000).toISOString();
    const day30Ago = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const [sellerRes, snapshotsRes, metricsRes, elasticityRes, changelogRes] = await Promise.all([
      supabase.from("sellers").select("default_lead_time_days,default_safety_days").eq("id", user.id).single(),
      supabase
        .from("inventory_snapshots")
        .select("snapshot_time,stock_quantity,price,availability")
        .eq("product_id", pid)
        .gte("snapshot_time", day60Ago)
        .order("snapshot_time"),
      supabase
        .from("tvelo_metrics")
        .select(
          "period_end,adjusted_velocity,confidence_score,coverage_days,current_price,current_stock,median_30d_velocity,sku_health_score,stockout_days,in_stock_days,confidence_breakdown",
        )
        .eq("product_id", pid)
        .order("period_end", { ascending: false })
        .limit(30),
      supabase
        .from("price_elasticity")
        .select(
          "change_date,previous_price,new_price,price_delta_pct,velocity_before,velocity_after,price_impact_percent,days_before,days_after",
        )
        .eq("product_id", pid)
        .order("change_date", { ascending: false })
        .limit(10),
      supabase
        .from("changelog")
        .select("event_date,event_type,delta_stock,message,confidence_impact")
        .eq("product_id", pid)
        .neq("event_type", "sales_like")
        .gte("event_date", day30Ago)
        .order("event_date", { ascending: false })
        .limit(60),
    ]);
    const errs = [sellerRes.error, snapshotsRes.error, metricsRes.error, elasticityRes.error, changelogRes.error]
      .filter(Boolean)
      .map((e: any) => e.message);
    return [
      { metrics: metricsRes.data as any[] | null, snapshots: snapshotsRes.data as any[] | null },
      errs.length
        ? `supabase errors: ${errs.join(" | ")}`
        : `snapshots=${snapshotsRes.data?.length ?? 0}, metrics=${metricsRes.data?.length ?? 0}, pid=${pid.slice(0, 8)}…`,
    ] as [any, string];
  });

  await step("карточка: byDay (toISOString на snapshot_time) + breakdowns", async () => {
    if (!detail) return [null, "пропуск"] as [any, string];
    const byDay = new Map<string, any>();
    for (const s of detail.snapshots ?? []) {
      const day = new Date(s.snapshot_time).toISOString().slice(0, 10);
      byDay.set(day, {
        date: day,
        stock: s.stock_quantity,
        price: Number(s.price),
        availability: s.availability ? 1 : 0,
        velocity: 0,
      });
    }
    for (const m of detail.metrics ?? []) {
      const day = m.period_end as string;
      if (byDay.has(day)) byDay.get(day)!.velocity = Number(m.adjusted_velocity);
    }
    const latest = detail.metrics?.[0];
    const hb = latest ? buildHealthBreakdown(latest) : [];
    const cb = latest ? buildConfidenceBreakdown(latest) : [];
    return [null, `chartPoints=${byDay.size}, healthRows=${hb.length}, confRows=${cb.length}`] as [any, string];
  });

  await step("битые даты в tvelo_metrics (period_end / period_start IS NULL)", async () => {
    const r1 = await supabase
      .from("tvelo_metrics")
      .select("product_id", { count: "exact", head: true })
      .is("period_end", null);
    const r2 = await supabase
      .from("tvelo_metrics")
      .select("product_id", { count: "exact", head: true })
      .is("period_start", null);
    return [
      null,
      `period_end NULL: ${r1.count ?? "?"}${r1.error ? ` (${r1.error.message})` : ""} · period_start NULL: ${r2.count ?? "?"}${r2.error ? ` (${r2.error.message})` : ""}`,
    ] as [any, string];
  });

  await step("t() с params", async () => {
    const s = t("sku.col.oosDays", { n: 30 });
    return [null, `→ "${s}"`] as [any, string];
  });

  return <DiagView steps={steps} />;
}
