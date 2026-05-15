import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DynamicsPage({ searchParams }: {
  searchParams: Promise<{ unit?: string }>;
}) {
  const sp = await searchParams;
  const unit: "month" | "week" = sp.unit === "week" ? "week" : "month";

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Берём все метрики за последние 90 дней (по weekly хватит, по monthly тоже)
  const lookbackDays = unit === "week" ? 84 : 365;
  const dayCutoff = new Date(Date.now() - lookbackDays * 86400_000).toISOString().slice(0, 10);
  const { data: metrics } = await supabase
    .from("tvelo_metrics")
    .select("product_id,period_end,adjusted_velocity,products(sku,product_name)")
    .gte("period_end", dayCutoff)
    .order("period_end", { ascending: true });

  const periodSet = new Set<string>();
  const byProduct: Record<string, { sku: string; name: string; periods: Record<string, number[]> }> = {};

  for (const m of metrics ?? []) {
    const pid = (m as any).product_id;
    const periodKey = unit === "week" ? toIsoWeek(m.period_end as string) : (m.period_end as string).slice(0, 7);
    periodSet.add(periodKey);
    const product = Array.isArray((m as any).products) ? (m as any).products[0] : (m as any).products;
    if (!byProduct[pid]) {
      byProduct[pid] = { sku: product?.sku ?? "—", name: product?.product_name ?? "", periods: {} };
    }
    byProduct[pid].periods[periodKey] = byProduct[pid].periods[periodKey] ?? [];
    byProduct[pid].periods[periodKey].push(Number(m.adjusted_velocity));
  }

  const periods = Array.from(periodSet).sort();
  const rows = Object.entries(byProduct)
    .map(([pid, data]) => ({
      pid,
      sku: data.sku,
      name: data.name,
      values: periods.map(p => {
        const arr = data.periods[p] ?? [];
        return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
      }),
    }))
    .filter(r => r.values.some(v => v != null));

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Динамика скорости продаж</h1>
          <p className="text-sm text-slate-500 mt-1">Окраска ячеек зелёным/красным относительно прошлого периода</p>
        </div>
        <div className="flex gap-1">
          <Link href={`/dashboard/dynamics?unit=week` as any}
                className={`text-xs px-3 py-1.5 rounded-lg border ${unit === "week" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200"}`}>
            По неделям
          </Link>
          <Link href={`/dashboard/dynamics?unit=month` as any}
                className={`text-xs px-3 py-1.5 rounded-lg border ${unit === "month" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200"}`}>
            По месяцам
          </Link>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <p className="text-slate-600">Накапливается история — таблица появится после {unit === "week" ? "первой недели" : "первого месяца"} расчётов</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs uppercase text-slate-600 sticky left-0 bg-slate-50">SKU</th>
                <th className="px-4 py-3 text-left text-xs uppercase text-slate-600">Название</th>
                {periods.map(p => (
                  <th key={p} className="px-4 py-3 text-right text-xs uppercase text-slate-600 whitespace-nowrap">
                    {unit === "week" ? p : new Date(p + "-01").toLocaleDateString("ru-RU", { month: "short", year: "numeric" })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.pid} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-xs sticky left-0 bg-white">
                    <Link href={`/dashboard/skus/${row.pid}` as any} className="text-teal-700 hover:text-teal-900">
                      {row.sku}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-700">{row.name}</td>
                  {row.values.map((v, i) => {
                    const prev = i > 0 ? row.values[i - 1] : null;
                    return (
                      <td key={i} className={`px-4 py-2 text-right font-mono ${cellColor(v, prev)}`}>
                        {v != null ? v.toFixed(2) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function cellColor(value: number | null, prev: number | null): string {
  if (value == null || prev == null || prev === 0) return "text-slate-700";
  const delta = (value - prev) / prev;
  if (delta > 0.1) return "bg-emerald-50 text-emerald-800";
  if (delta < -0.1) return "bg-red-50 text-red-800";
  return "text-slate-700";
}

/** ISO week label, например "2026-W19". */
function toIsoWeek(dateStr: string): string {
  const d = new Date(dateStr);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400_000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}
