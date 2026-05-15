import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { VelocitySparkline } from "./VelocitySparkline";
import { Icons } from "../../_components/Icons";

const PAGE_SIZE = 50;

const SEGMENTS = [
  { value: "",                    label: "Все" },
  { value: "fast_movers",         label: "Быстрые" },
  { value: "stable",              label: "Стабильные" },
  { value: "slow_movers",         label: "Медленные" },
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
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="size-1 rounded-full bg-lime-deep" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">Inventory</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl tracking-tight font-medium text-ink">SKU</h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <form className="flex items-center gap-2 text-sm">
            <label className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">Закупка на</label>
            <input
              type="number" name="reorder_days" defaultValue={reorderDays} min={1} max={365}
              className="w-20 px-2 py-1.5 border border-line rounded-lg text-center bg-paper font-mono text-sm focus:outline-none focus:border-lime-deep"
            />
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">дней</span>
            {segmentFilter && <input type="hidden" name="segment" value={segmentFilter} />}
            <button type="submit" className="px-2.5 py-1.5 text-xs bg-ink text-paper rounded-lg hover:bg-ink-soft transition">→</button>
          </form>
          <div className="inline-flex gap-1 rounded-lg border border-line bg-paper p-1">
            {SEGMENTS.map(s => {
              const params = new URLSearchParams();
              if (s.value) params.set("segment", s.value);
              if (reorderDays !== 30) params.set("reorder_days", String(reorderDays));
              const qs = params.toString();
              const isActive = segmentFilter === s.value;
              return (
                <Link
                  key={s.value}
                  href={`/dashboard/skus${qs ? `?${qs}` : ""}` as any}
                  className={`text-xs px-3 py-1.5 rounded-md font-medium transition ${
                    isActive ? "bg-ink text-paper" : "text-ink-muted hover:text-ink hover:bg-bg-soft"
                  }`}
                >
                  {s.label}
                </Link>
              );
            })}
          </div>
        </div>
      </header>

      <div className="overflow-x-auto rounded-2xl border border-line bg-paper">
        <table className="min-w-full text-sm">
          <thead className="bg-bg-soft border-b border-line">
            <tr>
              {["SKU", "Название", "Остаток", "Цена", "TVelo", "Тренд", "Покрытие", "OOS", `Закупка (${reorderDays}д)`, "Conf", "Health", "Сегмент"].map((h, i) => (
                <th
                  key={i}
                  className={`px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold ${
                    [2, 3, 4, 6, 7, 8, 9, 10].includes(i) ? "text-right" : i === 5 ? "text-center" : "text-left"
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map((p: any) => {
              const m = (p.tvelo_metrics?.[0] ?? null) as any;
              const adjVel = m?.adjusted_velocity != null ? Number(m.adjusted_velocity) : 0;
              const reorderQty = Math.round(adjVel * reorderDays);
              const isUnderestimated = m?.underestimated_sku;
              return (
                <tr key={p.product_id} className="hover:bg-bg-soft/50 transition">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link href={`/dashboard/skus/${p.product_id}` as any} className="text-lime-deep hover:text-ink font-medium transition">
                      {p.sku}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-ink-soft">{p.product_name}</div>
                    {isUnderestimated && (
                      <span className="font-mono text-[10px] uppercase tracking-widest text-azure font-semibold">недооценён</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular text-ink-soft">{m?.current_stock ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular text-ink-soft">{m?.current_price ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular text-ink">
                    {adjVel > 0 ? adjVel.toFixed(2) : "—"}
                  </td>
                  <td className="px-4 py-3"><VelocitySparkline points={sparkData[p.product_id] ?? []} /></td>
                  <td className="px-4 py-3 text-right tabular text-ink-soft">
                    {m?.coverage_days != null ? `${Number(m.coverage_days).toFixed(0)} д.` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular">
                    {m?.stockout_days != null ? (
                      <span className={m.stockout_days > 0 ? "text-orange font-semibold" : "text-ink-soft"}>
                        {m.stockout_days}
                      </span>
                    ) : <span className="text-ink-hush">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular text-lime-deep">
                    {adjVel > 0 ? reorderQty : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular text-ink-soft">
                    {m?.confidence_score != null ? `${Number(m.confidence_score).toFixed(0)}%` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <HealthBadge score={m?.sku_health_score} />
                  </td>
                  <td className="px-4 py-3"><SegmentBadge segment={m?.inventory_segment} /></td>
                </tr>
              );
            })}
            {!filtered.length && (
              <tr>
                <td colSpan={12} className="px-4 py-12 text-center text-ink-muted text-sm">
                  Пока нет данных или ничего не подходит под фильтр.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm flex-wrap gap-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">
            Всего: <span className="text-ink-soft tabular">{count ?? 0}</span> SKU · страница <span className="text-ink-soft tabular">{page}</span> из <span className="text-ink-soft tabular">{totalPages}</span>
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`?page=${page - 1}${segmentFilter ? `&segment=${segmentFilter}` : ""}` as any}
                    className="inline-flex items-center gap-1 px-3 py-1.5 border border-line rounded-lg text-ink-muted hover:text-ink hover:bg-bg-soft transition text-xs">
                <span className="rotate-180"><Icons.ArrowRight size={11} /></span> Назад
              </Link>
            )}
            {page < totalPages && (
              <Link href={`?page=${page + 1}${segmentFilter ? `&segment=${segmentFilter}` : ""}` as any}
                    className="inline-flex items-center gap-1 px-3 py-1.5 border border-line rounded-lg text-ink-muted hover:text-ink hover:bg-bg-soft transition text-xs">
                Вперёд <Icons.ArrowRight size={11} />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function HealthBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-ink-hush">—</span>;
  const n = Number(score);
  const color = n >= 75 ? "text-lime-deep" : n >= 60 ? "text-orange" : "text-rose";
  return <span className={`font-semibold tabular ${color}`}>{n.toFixed(0)}</span>;
}

function SegmentBadge({ segment }: { segment: string | null }) {
  if (!segment) return <span className="text-ink-hush">—</span>;
  const labels: Record<string, { text: string; cls: string }> = {
    fast_movers:         { text: "Быстрые",       cls: "text-lime-deep bg-lime-soft border-lime-deep/30" },
    stable:              { text: "Стабильные",    cls: "text-ink-soft bg-bg-soft border-line" },
    slow_movers:         { text: "Медленные",     cls: "text-orange bg-orange/10 border-orange/30" },
    dead_inventory_risk: { text: "Неликвид",       cls: "text-rose bg-rose/10 border-rose/30" },
    insufficient_data:   { text: "Мало данных",   cls: "text-ink-hush bg-bg-soft border-line" },
  };
  const conf = labels[segment] ?? { text: segment, cls: "text-ink-soft bg-bg-soft border-line" };
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest font-semibold ${conf.cls}`}>
      {conf.text}
    </span>
  );
}
