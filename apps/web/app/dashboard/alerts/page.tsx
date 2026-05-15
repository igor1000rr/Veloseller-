import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import AckButton from "./AckButton";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, { label: string; color: string }> = {
  critical_stock: { label: "Критически мало", color: "bg-red-100 text-red-800 border-red-200" },
  low_stock: { label: "Мало", color: "bg-amber-100 text-amber-800 border-amber-200" },
  dead_inventory: { label: "Неликвид", color: "bg-slate-100 text-slate-700 border-slate-200" },
  repeated_stockout: { label: "Регулярный OOS", color: "bg-orange-100 text-orange-800 border-orange-200" },
  underestimated_sku: { label: "Недооценён", color: "bg-purple-100 text-purple-800 border-purple-200" },
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Уведомления</h1>
        <span className="text-sm text-slate-500">{list.length} записей</span>
      </div>

      {list.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <p className="text-slate-600">Уведомлений пока нет — пересчёт ещё не запускался или у SKU нет проблем.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Тип</th>
                <th className="text-left px-4 py-3 font-medium">SKU</th>
                <th className="text-left px-4 py-3 font-medium">Сообщение</th>
                <th className="text-left px-4 py-3 font-medium">Дата</th>
                <th className="text-right px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((a: any) => {
                const meta = KIND_LABELS[a.kind] ?? { label: a.kind, color: "bg-slate-100" };
                const product = Array.isArray(a.products) ? a.products[0] : a.products;
                return (
                  <tr key={a.id} className={a.acknowledged_at ? "opacity-50" : ""}>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs border ${meta.color}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-slate-700">{product?.sku ?? "—"}</div>
                      <div className="text-xs text-slate-500">{product?.product_name ?? ""}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{a.message}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
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
