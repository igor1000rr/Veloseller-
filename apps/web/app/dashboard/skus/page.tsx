import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { VelocitySparkline } from "./VelocitySparkline";

const PAGE_SIZE = 50;

const SEGMENTS = [
  { value: "", label: "Все" },
  { value: "fast_movers", label: "Быстрые" },
  { value: "stable", label: "Стабильные" },
  { value: "slow_movers", label: "Медленные" },
  { value: "dead_inventory_risk", label: "Неликвид" },
];

export default async function SkusPage({ searchParams }: {
  searchParams: Promise<{ page?: string; segment?: string; reorder_days?: string; period?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const segmentFilter = sp.segment ?? "";
  const reorderDays = Math.max(1, parseInt(sp.reorder_days ?? "30", 10) || 30);
  const periodDays = (sp.period === "7" || sp.period === "90") ? parseInt(sp.period) : 30;
  const periodCutoff = new Date(Date.now() - (periodDays + 7) * 86400_000).toISOString().slice(0, 10);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: products, count } = await supabase
    .from("products")
    .select(`
      product_id, sku, product_name,
      tvelo_metrics (
        confirmed_velocity, adjusted_velocity, confidence_score,
        stockout_days, in_stock_days, coverage_days, current_stock,
        current_price, inventory_segment, sku_health_score, underestimated_sku,
        period_start, period_end
      )
    `, { count: "exact" })
    .eq("seller_id", user.id)
    .order("sku").range(from, to);

  // Подгружаем последние 7 метрик для sparkline
  const productIds = (products ?? []).map((p: any) => p.product_id);
  const sparkData: Record<string, number[]> = {};
  if (productIds.length > 0) {
    const { data: history } = await supabase
      .from("tvelo_metrics")
      .select("product_id,adjusted_velocity,period_end")
      .in("product_id", productIds)
      .order("period_end", { ascending: true });
    for (const h of history ?? []) {
      const arr = sparkData[(h as any).product_id] ?? [];
      arr.push(Number(h.adjusted_velocity));
      sparkData[(h as any).product_id] = arr.slice(-7);
    }
  }

  const filtered = (products ?? []).filter((p: any) => {
    // Берём метрику с подходящей длиной периода
    const metrics = (p.tvelo_metrics as any[] | undefined) ?? [];
    const matchedMetric = metrics.find(m => {
      const len = Math.round((new Date(m.period_end).getTime() - new Date(m.period_start).getTime()) / 86400_000);
      return Math.abs(len - (periodDays - 1)) <= 1;
    }) ?? metrics[0];
    p.tvelo_metrics = matchedMetric ? [matchedMetric] : [];
    if (!segmentFilter) return true;
    return matchedMetric?.inventory_segment === segmentFilter;
  });

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <h1 className="text-3xl font-bold text-slate-900">SKU</h1>
        <div className="flex items-center gap-3">
          {/* Reorder days control */}
          <form className="flex items-center gap-2 text-sm">
            <label className="text-slate-600">Закупка на</label>
            <input type="number" name="reorder_days" defaultValue={reorderDays} min={1} max={365}
                   className="w-20 px-2 py-1 border border-slate-300 rounded-md text-center"/>
            <span className="text-slate-600">дней</span>
            {segmentFilter && <input type="hidden" name="segment" value={segmentFilter} />}
            <button type="submit" className="px-3 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded-md">→</button>
          </form>
          <div className="flex gap-1">
            {SEGMENTS.map(s => (
              <Link
                key={s.value}
                href={`/dashboard/skus${s.value ? `?segment=${s.value}` : ""}${s.value && reorderDays !== 30 ? `&reorder_days=${reorderDays}` : (!s.value && reorderDays !== 30 ? `?reorder_days=${reorderDays}` : "")}` as any}
                className={`text-xs px-3 py-1.5 rounded-lg border ${segmentFilter === s.value ? "bg-teal-700 text-white border-teal-700" : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"}`}
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-600">
            <tr>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Название</th>
              <th className="px-4 py-3 text-right">Остаток</th>
              <th className="px-4 py-3 text-right">Цена</th>
              <th className="px-4 py-3 text-right">TVelo</th>
              <th className="px-4 py-3 text-center">Тренд</th>
              <th className="px-4 py-3 text-right">Покрытие</th>
              <th className="px-4 py-3 text-right">OOS</th>
              <th className="px-4 py-3 text-right">Закупка ({reorderDays}д)</th>
              <th className="px-4 py-3 text-right">Conf</th>
              <th className="px-4 py-3 text-right">Health</th>
              <th className="px-4 py-3">Сегмент</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p: any) => {
              const m = (p.tvelo_metrics?.[0] ?? null) as any;
              const adjVel = m?.adjusted_velocity != null ? Number(m.adjusted_velocity) : 0;
              const reorderQty = Math.round(adjVel * reorderDays);
              const isUnderestimated = m?.underestimated_sku;
              return (
                <tr key={p.product_id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link href={`/dashboard/skus/${p.product_id}` as any} className="text-teal-700 hover:text-teal-900 font-medium">
                      {p.sku}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div>{p.product_name}</div>
                    {isUnderestimated && <span className="text-xs text-violet-700 font-medium">недооценён</span>}
                  </td>
                  <td className="px-4 py-3 text-right">{m?.current_stock ?? "—"}</td>
                  <td className="px-4 py-3 text-right">{m?.current_price ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {adjVel > 0 ? adjVel.toFixed(2) : "—"}
                  </td>
                  <td className="px-4 py-3"><VelocitySparkline points={sparkData[p.product_id] ?? []} /></td>
                  <td className="px-4 py-3 text-right">
                    {m?.coverage_days != null ? `${Number(m.coverage_days).toFixed(0)} д.` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {m?.stockout_days != null ? (
                      <span className={m.stockout_days > 0 ? "text-amber-700 font-semibold" : ""}>
                        {m.stockout_days}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-teal-700">
                    {adjVel > 0 ? reorderQty : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">{m?.confidence_score != null ? `${Number(m.confidence_score).toFixed(0)}%` : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <HealthBadge score={m?.sku_health_score} />
                  </td>
                  <td className="px-4 py-3"><SegmentBadge segment={m?.inventory_segment} /></td>
                </tr>
              );
            })}
            {!filtered.length && (
              <tr>
                <td colSpan={12} className="px-4 py-12 text-center text-slate-500">
                  Пока нет данных или ничего не подходит под фильтр.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Всего: {count ?? 0} SKU · страница {page} из {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`?page=${page - 1}${segmentFilter ? `&segment=${segmentFilter}` : ""}` as any}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50">← Назад</Link>
            )}
            {page < totalPages && (
              <Link href={`?page=${page + 1}${segmentFilter ? `&segment=${segmentFilter}` : ""}` as any}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50">Вперёд →</Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function HealthBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-slate-400">—</span>;
  const n = Number(score);
  const color = n >= 75 ? "text-emerald-700" : n >= 60 ? "text-amber-700" : "text-red-700";
  return <span className={`font-semibold ${color}`}>{n.toFixed(0)}</span>;
}

function SegmentBadge({ segment }: { segment: string | null }) {
  if (!segment) return <span className="text-slate-400">—</span>;
  const labels: Record<string, { text: string; cls: string }> = {
    fast_movers: { text: "Быстрые", cls: "bg-emerald-50 text-emerald-700" },
    stable: { text: "Стабильные", cls: "bg-slate-100 text-slate-700" },
    slow_movers: { text: "Медленные", cls: "bg-amber-50 text-amber-700" },
    dead_inventory_risk: { text: "Неликвид", cls: "bg-red-50 text-red-700" },
    insufficient_data: { text: "Мало данных", cls: "bg-slate-50 text-slate-500" },
  };
  const conf = labels[segment] ?? { text: segment, cls: "bg-slate-100 text-slate-700" };
  return <span className={`rounded-md px-2 py-1 text-xs font-medium ${conf.cls}`}>{conf.text}</span>;
}
