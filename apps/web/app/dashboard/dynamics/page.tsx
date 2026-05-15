import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Icons } from "../../_components/Icons";

export const dynamic = "force-dynamic";

export default async function DynamicsPage({ searchParams }: {
  searchParams: Promise<{ unit?: string }>;
}) {
  const sp = await searchParams;
  const unit: "month" | "week" = sp.unit === "week" ? "week" : "month";

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

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
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="size-1 rounded-full bg-lime-deep" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">Dynamics</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl tracking-tight font-medium text-ink">
            Динамика скорости продаж
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Ячейки подкрашены: <span className="text-lime-deep font-medium">зелёный</span> — рост &gt;10%, <span className="text-rose font-medium">красный</span> — падение &gt;10%, без подкраски — ±10% от предыдущего периода
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-line bg-paper p-1">
          <UnitToggle href="/dashboard/dynamics?unit=week" active={unit === "week"}>
            По неделям
          </UnitToggle>
          <UnitToggle href="/dashboard/dynamics?unit=month" active={unit === "month"}>
            По месяцам
          </UnitToggle>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-line bg-paper p-10 md:p-14 text-center">
          <div className="size-12 mx-auto rounded-full bg-lime-soft flex items-center justify-center text-lime-deep mb-4">
            <Icons.Health />
          </div>
          <p className="font-display text-xl text-ink font-medium">
            Накапливается история
          </p>
          <p className="mt-2 text-sm text-ink-muted max-w-md mx-auto">
            Таблица появится после {unit === "week" ? "первой недели" : "первого месяца"} расчётов.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-paper overflow-x-auto shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="border-b border-line bg-bg-soft">
              <tr>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold sticky left-0 bg-bg-soft">
                  SKU
                </th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">
                  Название
                </th>
                {periods.map(p => (
                  <th key={p} className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold whitespace-nowrap">
                    {unit === "week"
                      ? p
                      : new Date(p + "-01").toLocaleDateString("ru-RU", { month: "short", year: "numeric" })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.pid} className="border-b border-line hover:bg-bg-soft/50 transition">
                  <td className="px-4 py-2.5 font-mono text-xs sticky left-0 bg-paper">
                    <Link href={`/dashboard/skus/${row.pid}` as any} className="text-lime-deep hover:text-ink transition">
                      {row.sku}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft text-[13px]">{row.name}</td>
                  {row.values.map((v, i) => {
                    const prev = i > 0 ? row.values[i - 1] : null;
                    return (
                      <td key={i} className={`px-4 py-2.5 text-right font-mono tabular text-[13px] font-medium ${cellColor(v, prev)}`}>
                        {v != null ? v.toFixed(2) : <span className="text-ink-hush">—</span>}
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

function UnitToggle({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href as any}
      className={`px-3 py-1.5 text-xs rounded-md font-medium transition ${
        active ? "bg-ink text-paper" : "text-ink-muted hover:text-ink hover:bg-bg-soft"
      }`}
    >
      {children}
    </Link>
  );
}

function cellColor(value: number | null, prev: number | null): string {
  if (value == null) return "text-ink-hush";
  if (prev == null || prev === 0) return "text-ink-soft";
  const delta = (value - prev) / prev;
  if (delta > 0.1) return "bg-lime-soft text-lime-deep";
  if (delta < -0.1) return "bg-rose/10 text-rose";
  return "text-ink-soft";
}

function toIsoWeek(dateStr: string): string {
  const d = new Date(dateStr);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400_000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}
