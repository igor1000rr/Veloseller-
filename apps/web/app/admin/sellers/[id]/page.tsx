import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SellerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createSupabaseAdminClient();

  const { data: seller } = await supabase
    .from("sellers")
    .select("id,email,display_name,plan,trial_ends_at,timezone,created_at,telegram_chat_id,notify_email,notify_telegram")
    .eq("id", id).maybeSingle();
  if (!seller) notFound();

  const [
    { count: skusCount },
    { count: snapshotsCount },
    { count: alertsUnack },
    { data: connections },
    { data: latestStore },
    { data: recentAlerts },
  ] = await Promise.all([
    supabase.from("products").select("product_id", { count: "exact", head: true }).eq("seller_id", id),
    supabase.from("inventory_snapshots").select("snapshot_id", { count: "exact", head: true }),
    supabase.from("alerts").select("id", { count: "exact", head: true }).eq("seller_id", id).is("acknowledged_at", null),
    supabase.from("data_connections").select("*").eq("seller_id", id).order("created_at", { ascending: false }),
    supabase.from("store_metrics").select("*").eq("seller_id", id).order("period_end", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("alerts").select("id,kind,message,created_at,acknowledged_at,products(sku)").eq("seller_id", id)
      .order("created_at", { ascending: false }).limit(15),
  ]);

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/admin/sellers" className="text-sm text-violet-600 hover:text-violet-700">← Все селлеры</Link>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mt-2">{seller.email}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {seller.display_name ?? "Без имени"} · {seller.timezone} · регистрация {new Date(seller.created_at).toLocaleDateString("ru-RU")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PlanBadge plan={seller.plan} />
          {seller.plan === "trial" && seller.trial_ends_at && (
            <span className="text-xs text-slate-500">trial до {new Date(seller.trial_ends_at).toLocaleDateString("ru-RU")}</span>
          )}
        </div>
      </header>

      {/* KPI */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="SKU" value={skusCount ?? 0} accent="violet" />
        <Kpi label="Unack alerts" value={alertsUnack ?? 0} accent="blue" />
        <Kpi label="Health" value={latestStore?.warehouse_health_score != null ? `${Number(latestStore.warehouse_health_score).toFixed(0)}/100` : "—"} accent="indigo" />
        <Kpi label="Lost revenue" value={latestStore?.lost_revenue != null ? formatMoney(latestStore.lost_revenue) : "—"} accent="sky" />
      </section>

      {/* Communication */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Каналы уведомлений</h2>
        <div className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-slate-500 text-xs">Email digest</div>
            <div className="mt-1 flex items-center gap-2">
              <Dot on={seller.notify_email} />
              <span className="text-slate-900">{seller.notify_email ? "Включён" : "Выключен"}</span>
            </div>
          </div>
          <div>
            <div className="text-slate-500 text-xs">Telegram</div>
            <div className="mt-1 flex items-center gap-2">
              <Dot on={!!seller.telegram_chat_id && seller.notify_telegram} />
              <span className="text-slate-900">
                {seller.telegram_chat_id ? <code className="text-xs">{seller.telegram_chat_id}</code> : "Не настроен"}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Connections */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Источники данных ({connections?.length ?? 0})</h2>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {(connections ?? []).length > 0 ? (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <Th>Имя</Th><Th>Тип</Th><Th>Статус</Th><Th>Последний sync</Th><Th>Ошибка</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(connections ?? []).map((c: any) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-900">{c.name}</td>
                    <td className="px-4 py-2.5 text-slate-700 text-xs">{c.marketplace || c.source}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">
                      {c.last_sync_at ? new Date(c.last_sync_at).toLocaleString("ru-RU") : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-red-600 text-xs max-w-xs truncate" title={c.last_error}>{c.last_error ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-slate-400 text-sm">Источников не подключено</div>
          )}
        </div>
      </section>

      {/* Recent alerts */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Последние уведомления</h2>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {(recentAlerts ?? []).length > 0 ? (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr><Th>Тип</Th><Th>SKU</Th><Th>Сообщение</Th><Th>Дата</Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(recentAlerts ?? []).map((a: any) => {
                  const product = Array.isArray(a.products) ? a.products[0] : a.products;
                  return (
                    <tr key={a.id} className={a.acknowledged_at ? "opacity-50 hover:bg-slate-50" : "hover:bg-slate-50"}>
                      <td className="px-4 py-2.5"><AlertBadge kind={a.kind} /></td>
                      <td className="px-4 py-2.5 font-mono text-xs">{product?.sku ?? "—"}</td>
                      <td className="px-4 py-2.5 text-slate-700">{a.message}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">
                        {new Date(a.created_at).toLocaleString("ru-RU")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-slate-400 text-sm">Уведомлений нет</div>
          )}
        </div>
      </section>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-4 py-2.5 font-medium text-slate-600 text-xs uppercase tracking-wider text-left">{children}</th>;
}
function Kpi({ label, value, accent }: { label: string; value: number | string; accent: "violet" | "blue" | "indigo" | "sky" }) {
  const colors = {
    violet: "border-l-violet-500",
    blue: "border-l-blue-500",
    indigo: "border-l-indigo-500",
    sky: "border-l-sky-500",
  };
  return (
    <div className={`bg-white border border-slate-200 border-l-4 ${colors[accent]} rounded-xl p-4`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}
function PlanBadge({ plan }: { plan: string }) {
  const s: Record<string, string> = {
    trial: "bg-slate-100 text-slate-700", starter: "bg-sky-100 text-sky-700",
    growth: "bg-blue-100 text-blue-700", pro: "bg-violet-100 text-violet-700",
  };
  return <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${s[plan] ?? s.trial}`}>{plan}</span>;
}
function StatusBadge({ status }: { status: string }) {
  const s: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    paused: "bg-slate-50 text-slate-700 border-slate-200",
    error: "bg-red-50 text-red-700 border-red-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return <span className={`inline-block px-2 py-0.5 rounded text-xs border ${s[status] ?? s.pending}`}>{status}</span>;
}
function AlertBadge({ kind }: { kind: string }) {
  const s: Record<string, string> = {
    critical_stock: "bg-red-100 text-red-800",
    low_stock: "bg-amber-100 text-amber-800",
    dead_inventory: "bg-slate-100 text-slate-700",
    repeated_stockout: "bg-orange-100 text-orange-800",
    underestimated_sku: "bg-violet-100 text-violet-800",
  };
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${s[kind] ?? "bg-slate-100"}`}>{kind}</span>;
}
function Dot({ on }: { on: boolean }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${on ? "bg-emerald-500" : "bg-slate-300"}`}></span>;
}
function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number(n));
}
