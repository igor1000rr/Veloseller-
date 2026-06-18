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
        <div className="min-w-0">
          <Link href="/admin/sellers" className="text-sm text-lime-deep hover:text-ink transition">← Все селлеры</Link>
          <h1 className="mt-2 font-display text-2xl md:text-3xl tracking-tight font-medium text-ink break-all">{seller.email}</h1>
          <p className="text-sm text-ink-muted mt-1">
            {seller.display_name ?? "Без имени"} · {seller.timezone} · регистрация {new Date(seller.created_at).toLocaleDateString("ru-RU")}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <PlanBadge plan={seller.plan} />
          {seller.plan === "trial" && seller.trial_ends_at && (
            <span className="text-xs text-ink-muted whitespace-nowrap">trial до {new Date(seller.trial_ends_at).toLocaleDateString("ru-RU")}</span>
          )}
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="SKU" value={skusCount ?? 0} accent="lime" />
        <Kpi label="Unack alerts" value={alertsUnack ?? 0} accent="azure" />
        <Kpi label="Health" value={latestStore?.warehouse_health_score != null ? `${Number(latestStore.warehouse_health_score).toFixed(0)}/100` : "—"} accent="emerald" />
        <Kpi label="Lost revenue" value={latestStore?.lost_revenue != null ? formatMoney(latestStore.lost_revenue) : "—"} accent="orange" />
      </section>

      <section>
        <SectionTitle>Каналы уведомлений</SectionTitle>
        <div className="bg-paper border border-line rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-ink-muted text-xs">Email digest</div>
            <div className="mt-1 flex items-center gap-2">
              <Dot on={seller.notify_email} />
              <span className="text-ink">{seller.notify_email ? "Включён" : "Выключен"}</span>
            </div>
          </div>
          <div>
            <div className="text-ink-muted text-xs">Telegram</div>
            <div className="mt-1 flex items-center gap-2">
              <Dot on={!!seller.telegram_chat_id && seller.notify_telegram} />
              <span className="text-ink">
                {seller.telegram_chat_id ? <code className="text-xs font-mono">{seller.telegram_chat_id}</code> : "Не настроен"}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section>
        <SectionTitle>Источники данных ({connections?.length ?? 0})</SectionTitle>
        <div className="bg-paper border border-line rounded-2xl overflow-hidden">
          {(connections ?? []).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-bg-soft border-b border-line">
                  <tr>
                    <Th>Имя</Th><Th>Тип</Th><Th>Статус</Th><Th>Последний sync</Th><Th>Ошибка</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(connections ?? []).map((c: any) => (
                    <tr key={c.id} className="hover:bg-bg-soft transition">
                      <td className="px-4 py-2.5 text-ink whitespace-nowrap">{c.name}</td>
                      <td className="px-4 py-2.5 text-ink-soft text-xs whitespace-nowrap">{c.marketplace || c.source}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={c.status} /></td>
                      <td className="px-4 py-2.5 text-ink-muted text-xs whitespace-nowrap">
                        {c.last_sync_at ? new Date(c.last_sync_at).toLocaleString("ru-RU") : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-rose text-xs max-w-xs truncate" title={c.last_error}>{c.last_error ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-ink-hush text-sm">Источников не подключено</div>
          )}
        </div>
      </section>

      <section>
        <SectionTitle>Последние уведомления</SectionTitle>
        <div className="bg-paper border border-line rounded-2xl overflow-hidden">
          {(recentAlerts ?? []).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-bg-soft border-b border-line">
                  <tr><Th>Тип</Th><Th>SKU</Th><Th>Сообщение</Th><Th>Дата</Th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(recentAlerts ?? []).map((a: any) => {
                    const product = Array.isArray(a.products) ? a.products[0] : a.products;
                    return (
                      <tr key={a.id} className={a.acknowledged_at ? "opacity-50 hover:bg-bg-soft" : "hover:bg-bg-soft transition"}>
                        <td className="px-4 py-2.5"><AlertBadge kind={a.kind} /></td>
                        <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">{product?.sku ?? "—"}</td>
                        <td className="px-4 py-2.5 text-ink-soft">{a.message}</td>
                        <td className="px-4 py-2.5 text-ink-muted text-xs whitespace-nowrap">
                          {new Date(a.created_at).toLocaleString("ru-RU")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-ink-hush text-sm">Уведомлений нет</div>
          )}
        </div>
      </section>
    </div>
  );
}

function Th({ children, align }: { children?: React.ReactNode; align?: "right" }) {
  return <th className={`px-4 py-2.5 font-mono text-ink-hush text-[10px] uppercase tracking-widest font-semibold whitespace-nowrap ${align === "right" ? "text-right" : "text-left"}`}>{children}</th>;
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="size-1 rounded-full bg-orange" />
      <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-orange font-semibold">{children}</h2>
    </div>
  );
}
function Kpi({ label, value, accent }: { label: string; value: number | string; accent: "lime" | "azure" | "emerald" | "orange" }) {
  const border = {
    lime: "border-l-lime-deep",
    azure: "border-l-azure",
    emerald: "border-l-emerald",
    orange: "border-l-orange",
  }[accent];
  return (
    <div className={`bg-paper border border-line border-l-4 ${border} rounded-2xl p-4`}>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hush">{label}</div>
      <div className="mt-1.5 font-display text-2xl md:text-3xl tabular font-medium text-ink break-words">{value}</div>
    </div>
  );
}
function PlanBadge({ plan }: { plan: string }) {
  const cls = plan === "pro"     ? "bg-lime-deep text-paper"
            : plan === "growth"  ? "bg-lime text-ink"
            : plan === "starter" ? "bg-azure/15 text-azure border border-azure/30"
            :                       "bg-bg-soft text-ink-muted border border-line";
  return <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-medium font-mono uppercase tracking-widest ${cls}`}>{plan}</span>;
}
function StatusBadge({ status }: { status: string }) {
  const s: Record<string, string> = {
    active: "text-lime-deep border-lime-deep/30 bg-lime-soft",
    paused: "text-ink-muted border-line bg-bg-soft",
    error: "text-rose border-rose/30 bg-rose/10",
    pending: "text-orange border-orange/30 bg-orange/10",
  };
  return <span className={`inline-block px-2 py-0.5 rounded text-xs border font-mono uppercase tracking-widest ${s[status] ?? s.pending}`}>{status}</span>;
}
function AlertBadge({ kind }: { kind: string }) {
  const s: Record<string, string> = {
    critical_stock: "bg-rose/10 text-rose border border-rose/30",
    low_stock: "bg-orange/10 text-orange border border-orange/30",
    dead_inventory: "bg-bg-soft text-ink-muted border border-line",
    repeated_stockout: "bg-orange/10 text-orange border border-orange/30",
    underestimated_sku: "bg-azure/10 text-azure border border-azure/30",
  };
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium font-mono ${s[kind] ?? "bg-bg-soft text-ink-muted border border-line"}`}>{kind}</span>;
}
function Dot({ on }: { on: boolean }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${on ? "bg-lime-deep" : "bg-line-2"}`}></span>;
}
function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number(n));
}
