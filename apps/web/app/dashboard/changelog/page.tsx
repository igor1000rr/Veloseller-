import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  first_snapshot: { label: "Старт", color: "bg-slate-100 text-slate-700" },
  sales_like: { label: "Продажа", color: "bg-emerald-100 text-emerald-800" },
  replenishment_like: { label: "Пополнение", color: "bg-blue-100 text-blue-800" },
  anomaly_like: { label: "Аномалия", color: "bg-amber-100 text-amber-800" },
  missing_data: { label: "Нет данных", color: "bg-slate-100 text-slate-700" },
  recount_like: { label: "Пересчёт", color: "bg-purple-100 text-purple-800" },
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Журнал событий</h1>
        <span className="text-sm text-slate-500">{list.length} записей за последний период</span>
      </div>

      {list.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <p className="text-slate-600">Журнал пуст — пересчёт не запускался или данных нет.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Дата</th>
                <th className="text-left px-4 py-3 font-medium">SKU</th>
                <th className="text-left px-4 py-3 font-medium">Тип</th>
                <th className="text-left px-4 py-3 font-medium">Сообщение</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((e: any) => {
                const meta = TYPE_LABELS[e.event_type] ?? { label: e.event_type, color: "bg-slate-100" };
                const product = Array.isArray(e.products) ? e.products[0] : e.products;
                return (
                  <tr key={e.id}>
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                      {new Date(e.event_date).toLocaleDateString("ru-RU")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-slate-700">{product?.sku ?? "—"}</div>
                      <div className="text-xs text-slate-500">{product?.product_name ?? ""}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs ${meta.color}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{e.message}</td>
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
