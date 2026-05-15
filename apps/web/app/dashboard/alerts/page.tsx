import { createSupabaseServerClient } from "@/lib/supabase/server";
import AckButton from "./AckButton";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, { label: string; cls: string }> = {
  critical_stock:    { label: "Критически мало", cls: "text-rose border-rose/30 bg-rose/10" },
  low_stock:         { label: "Мало",            cls: "text-orange border-orange/30 bg-orange/10" },
  dead_inventory:    { label: "Неликвид",        cls: "text-ink-soft border-line bg-bg-soft" },
  repeated_stockout: { label: "Регулярный OOS",  cls: "text-orange border-orange/40 bg-orange/15" },
  underestimated_sku:{ label: "Недооценён",       cls: "text-azure border-azure/30 bg-azure/10" },
};

export default async function AlertsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: alerts } = await supabase
    .from("alerts")
    .select("id,kind,message,created_at,acknowledged_at,product_id,payload,products(sku,product_name)")
    .order("created_at", { ascending: false })
    .limit(200);

  const list = alerts ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="size-1 rounded-full bg-lime-deep" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">Alerts</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl tracking-tight font-medium text-ink">Уведомления</h1>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">{list.length} записей</span>
      </header>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-line bg-paper p-10 md:p-14 text-center">
          <p className="text-ink-muted text-sm">Уведомлений пока нет — пересчёт ещё не запускался или у SKU нет проблем.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-paper overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-soft border-b border-line">
              <tr>
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Тип</th>
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">SKU</th>
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Сообщение</th>
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Дата</th>
                <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((a: any) => {
                const meta = KIND_LABELS[a.kind] ?? { label: a.kind, cls: "text-ink-soft border-line bg-bg-soft" };
                const product = Array.isArray(a.products) ? a.products[0] : a.products;
                return (
                  <tr key={a.id} className={`hover:bg-bg-soft/50 transition ${a.acknowledged_at ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border font-semibold ${meta.cls}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-ink">{product?.sku ?? "—"}</div>
                      <div className="text-xs text-ink-hush">{product?.product_name ?? ""}</div>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{a.message}</td>
                    <td className="px-4 py-3 text-ink-hush text-xs whitespace-nowrap font-mono">
                      {new Date(a.created_at).toLocaleString("ru-RU")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!a.acknowledged_at && <AckButton id={a.id} />}
                    </td>
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
