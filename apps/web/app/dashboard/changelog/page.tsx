import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, { label: string; cls: string }> = {
  first_snapshot:     { label: "Старт",      cls: "text-ink-soft bg-bg-soft border-line" },
  sales_like:         { label: "Продажа",    cls: "text-lime-deep bg-lime-soft border-lime-deep/30" },
  replenishment_like: { label: "Пополнение", cls: "text-azure bg-azure/10 border-azure/30" },
  anomaly_like:       { label: "Аномалия",   cls: "text-orange bg-orange/10 border-orange/30" },
  missing_data:       { label: "Нет данных", cls: "text-ink-soft bg-bg-soft border-line" },
  recount_like:       { label: "Пересчёт",   cls: "text-azure bg-azure/10 border-azure/30" },
};

export default async function ChangelogPage() {
  const supabase = await createSupabaseServerClient();
  const { data: entries } = await supabase
    .from("changelog")
    .select("id,event_date,event_type,delta_stock,message,confidence_impact,products(sku,product_name)")
    .order("event_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  const list = entries ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="size-1 rounded-full bg-lime-deep" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">Changelog</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl tracking-tight font-medium text-ink">Журнал событий</h1>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">{list.length} записей</span>
      </header>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-line bg-paper p-10 md:p-14 text-center">
          <p className="text-ink-muted text-sm">Журнал пуст — пересчёт не запускался или данных нет.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-paper overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-soft border-b border-line">
              <tr>
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Дата</th>
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">SKU</th>
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Тип</th>
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Сообщение</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((e: any) => {
                const meta = TYPE_LABELS[e.event_type] ?? { label: e.event_type, cls: "text-ink-soft bg-bg-soft border-line" };
                const product = Array.isArray(e.products) ? e.products[0] : e.products;
                return (
                  <tr key={e.id} className="hover:bg-bg-soft/50 transition">
                    <td className="px-4 py-3 text-ink-soft whitespace-nowrap font-mono text-xs">
                      {new Date(e.event_date).toLocaleDateString("ru-RU")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-ink">{product?.sku ?? "—"}</div>
                      <div className="text-xs text-ink-hush">{product?.product_name ?? ""}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border font-semibold ${meta.cls}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{e.message}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
