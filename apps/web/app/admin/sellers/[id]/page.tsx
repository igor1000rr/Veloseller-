import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  RADAR_BRANDS_LIMITS,
  VELOSELLER_WAREHOUSES_LIMITS,
  VELOSELLER_SKU_LIMITS,
} from "@/lib/robokassa";
import { SellerAdminActions, AdminResyncButton } from "./SellerAdminActions";

export const dynamic = "force-dynamic";

// Сетки лимитов для автоподстановки в форме смены плана (из lib/robokassa.ts).
const veloLimits: Record<string, { wh: number; sku: number }> = {
  starter: { wh: VELOSELLER_WAREHOUSES_LIMITS.starter, sku: VELOSELLER_SKU_LIMITS.starter },
  growth:  { wh: VELOSELLER_WAREHOUSES_LIMITS.growth,  sku: VELOSELLER_SKU_LIMITS.growth },
  pro:     { wh: VELOSELLER_WAREHOUSES_LIMITS.pro,     sku: VELOSELLER_SKU_LIMITS.pro },
};
const radarLimits: Record<string, number> = {
  start:  RADAR_BRANDS_LIMITS.radar_start,
  seller: RADAR_BRANDS_LIMITS.radar_seller,
  pro:    RADAR_BRANDS_LIMITS.radar_pro,
  expert: RADAR_BRANDS_LIMITS.radar_expert,
};

// Какие источники можно форс-ресинкать (см. adminResyncConnection в actions.ts).
function canResync(c: any): boolean {
  if (c.source === "google_sheet") return true;
  if (c.source === "marketplace_api") return ["ozon", "wildberries", "shopify"].includes(c.marketplace);
  return false;
}

export default async function SellerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createSupabaseAdminClient();
  const now = new Date();

  const { data: seller } = await supabase
    .from("sellers")
    .select("id,email,display_name,plan,trial_ends_at,timezone,created_at,telegram_chat_id,notify_email,notify_telegram,plan_warehouses_limit,plan_sku_per_warehouse_limit,subscription_expires_at,subscription_status,last_payment_failed_at,last_payment_failed_reason,payment_failure_count,last_payment_succeeded_at,radar_plan,radar_brands_limit,radar_active_until,tax_rate,currency")
    .eq("id", id).maybeSingle();
  if (!seller) notFound();

  const [
    { count: skusCount },
    { count: alertsUnack },
    { data: connections },
    { data: latestStore },
    { data: recentAlerts },
    { data: auditRows },
  ] = await Promise.all([
    supabase.from("products").select("product_id", { count: "exact", head: true }).eq("seller_id", id),
    supabase.from("alerts").select("id", { count: "exact", head: true }).eq("seller_id", id).is("acknowledged_at", null),
    supabase.from("data_connections").select("id,name,source,marketplace,status,last_sync_at,last_error,created_at").eq("seller_id", id).order("created_at", { ascending: false }),
    supabase.from("store_metrics").select("*").eq("seller_id", id).order("period_end", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("alerts").select("id,kind,message,created_at,acknowledged_at,products(sku)").eq("seller_id", id)
      .order("created_at", { ascending: false }).limit(15),
    supabase.from("admin_audit_log").select("id,admin_email,action,details,created_at")
      .eq("target_seller_id", id).order("created_at", { ascending: false }).limit(10),
  ]);

  const subExp = seller.subscription_expires_at ? new Date(seller.subscription_expires_at) : null;
  const subLapsed = subExp ? subExp.getTime() <= now.getTime() : false;
  const subDaysLeft = subExp ? Math.ceil((subExp.getTime() - now.getTime()) / 86400_000) : null;

  const radarUntil = seller.radar_active_until ? new Date(seller.radar_active_until) : null;
  const radarActive = radarUntil ? radarUntil.getTime() > now.getTime() : false;

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
        <SectionTitle>Подписка и биллинг</SectionTitle>
        <div className="bg-paper border border-line rounded-2xl p-5 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <Field label="План" value={seller.plan} />
          <Field label="Статус подписки" value={seller.subscription_status ?? "—"} />
          <Field
            label="Подписка действует до"
            tone={subLapsed ? "rose" : undefined}
            value={
              subExp
                ? `${subExp.toLocaleDateString("ru-RU")} · ${subLapsed ? "истекла" : `ещё ${subDaysLeft} дн.`}`
                : "бессрочно / не задана"
            }
          />
          <Field label="Лимит складов" value={seller.plan_warehouses_limit ?? "—"} />
          <Field label="Лимит SKU / склад" value={seller.plan_sku_per_warehouse_limit ?? "—"} />
          <Field label="Налог" value={seller.tax_rate != null ? `${seller.tax_rate}%` : "—"} />
          <Field
            label="Radar"
            tone={seller.radar_plan && seller.radar_plan !== "none" && radarUntil && !radarActive ? "rose" : undefined}
            value={
              !seller.radar_plan || seller.radar_plan === "none"
                ? "выключен"
                : `${seller.radar_plan} · ${seller.radar_brands_limit ?? 0} бр.${radarUntil ? ` · ${radarActive ? "до " + radarUntil.toLocaleDateString("ru-RU") : "истёк"}` : ""}`
            }
          />
          <Field label="Последняя оплата" value={seller.last_payment_succeeded_at ? new Date(seller.last_payment_succeeded_at).toLocaleDateString("ru-RU") : "—"} />
          <Field label="Валюта" value={seller.currency ?? "RUB"} />
        </div>
        {seller.last_payment_failed_at && (
          <div className="mt-3 rounded-2xl border border-rose/30 bg-rose/[0.04] p-4 text-sm">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-rose font-semibold mb-1">Сбой оплаты</div>
            <div className="text-ink-soft">
              {new Date(seller.last_payment_failed_at).toLocaleString("ru-RU")}
              {" · попыток: "}{seller.payment_failure_count ?? 0}
              {seller.last_payment_failed_reason ? ` · ${seller.last_payment_failed_reason}` : ""}
            </div>
          </div>
        )}
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
        <SectionTitle>Действия администратора</SectionTitle>
        <SellerAdminActions
          sellerId={seller.id}
          email={seller.email ?? ""}
          plan={seller.plan}
          warehousesLimit={seller.plan_warehouses_limit ?? 0}
          skuLimit={seller.plan_sku_per_warehouse_limit ?? 0}
          radarPlan={seller.radar_plan ?? "none"}
          veloLimits={veloLimits}
          radarLimits={radarLimits}
        />
      </section>

      <section>
        <SectionTitle>Источники данных ({connections?.length ?? 0})</SectionTitle>
        <div className="bg-paper border border-line rounded-2xl overflow-hidden">
          {(connections ?? []).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[780px]">
                <thead className="bg-bg-soft border-b border-line">
                  <tr>
                    <Th>Имя</Th><Th>Тип</Th><Th>Статус</Th><Th>Последний sync</Th><Th>Ошибка</Th><Th>Ресинк</Th>
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
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <AdminResyncButton connectionId={c.id} disabled={!canResync(c)} />
                      </td>
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

      <section>
        <SectionTitle>Журнал действий админа</SectionTitle>
        <div className="bg-paper border border-line rounded-2xl overflow-hidden">
          {(auditRows ?? []).length > 0 ? (
            <div className="divide-y divide-line">
              {(auditRows ?? []).map((r: any) => (
                <div key={r.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm text-ink"><code className="font-mono text-xs">{r.action}</code></div>
                    {compactDetails(r.details) && (
                      <div className="mt-0.5 font-mono text-[11px] text-ink-hush break-words">{compactDetails(r.details)}</div>
                    )}
                    <div className="mt-0.5 font-mono text-[10px] text-ink-hush">{r.admin_email}</div>
                  </div>
                  <div className="font-mono text-[10px] text-ink-muted whitespace-nowrap shrink-0">
                    {new Date(r.created_at).toLocaleString("ru-RU")}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-ink-hush text-sm">Действий ещё не было</div>
          )}
        </div>
      </section>
    </div>
  );
}

function compactDetails(d: any): string {
  if (!d || typeof d !== "object") return "";
  return Object.entries(d)
    .map(([k, v]) => `${k}=${v !== null && typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

function Field({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "rose" }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-hush">{label}</div>
      <div className={`mt-0.5 text-sm break-words ${tone === "rose" ? "text-rose font-medium" : "text-ink"}`}>{value}</div>
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
