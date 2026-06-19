import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { MrrChart } from "../AdminCharts";
import { PLAN_PRICES } from "@/lib/robokassa";
import { computeMrr } from "@/lib/admin/mrr";

export const dynamic = "force-dynamic";

const DAY_MS = 86400_000;

export default async function FinancePage() {
  const supabase = createSupabaseAdminClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    { data: sellers },
    { count: trialC },
    { count: invoicesPaid },
    { count: invoicesPending },
    { data: paidInvoices },
    { data: recentInvoices },
    { data: failedSellers },
  ] = await Promise.all([
    supabase.from("sellers").select("plan,subscription_expires_at,created_at"),
    supabase.from("sellers").select("id", { count: "exact", head: true }).eq("plan", "trial"),
    supabase.from("robokassa_invoices").select("id", { count: "exact", head: true }).eq("status", "paid"),
    supabase.from("robokassa_invoices").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("robokassa_invoices").select("amount,paid_at").eq("status", "paid"),
    supabase.from("robokassa_invoices")
      .select("id,inv_id,plan,amount,status,paid_at,created_at,seller_id,sellers(email)")
      .order("created_at", { ascending: false }).limit(10),
    supabase.from("sellers")
      .select("id,email,plan,last_payment_failed_at,last_payment_failed_reason,payment_failure_count")
      .not("last_payment_failed_at", "is", null)
      .order("last_payment_failed_at", { ascending: false }).limit(20),
  ]);

  const allSellers = (sellers ?? []) as { plan: string; subscription_expires_at: string | null; created_at: string }[];
  const { mrr, activePaid, lapsedCount, byPlan } = computeMrr(allSellers, now);
  const arr = mrr * 12;
  const arpu = activePaid > 0 ? mrr / activePaid : 0;
  const trial = trialC ?? 0;
  // «Призраки»: платный план, но subscription_expires_at не задан (выдан вручную / legacy).
  const ghost = allSellers.filter(
    s => (["starter", "growth", "pro"] as readonly string[]).includes(s.plan) && !s.subscription_expires_at,
  ).length;

  // Реально собранные деньги (оплаченные инвойсы Robokassa).
  const paid = (paidInvoices ?? []) as { amount: number | string; paid_at: string | null }[];
  const collectedTotal = paid.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const collectedMonth = paid.reduce(
    (s, r) => (r.paid_at && new Date(r.paid_at) >= monthStart ? s + Number(r.amount ?? 0) : s), 0,
  );

  // Собрано по неделям (12 недель) — фактические оплаты.
  const weeks = 12;
  const collectedSeries: { date: string; mrr: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const end = new Date(now.getTime() - i * 7 * DAY_MS);
    const start = new Date(end.getTime() - 7 * DAY_MS);
    const sum = paid.reduce((s, r) => {
      if (!r.paid_at) return s;
      const t = new Date(r.paid_at).getTime();
      return t > start.getTime() && t <= end.getTime() ? s + Number(r.amount ?? 0) : s;
    }, 0);
    collectedSeries.push({
      date: end.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
      mrr: sum,
    });
  }

  const revenueByPlan = (["starter", "growth", "pro"] as const).map(p => {
    const bp = byPlan.find(b => b.plan === p);
    return {
      plan: p.charAt(0).toUpperCase() + p.slice(1),
      price: (PLAN_PRICES as Record<string, number>)[p] ?? 0,
      count: bp?.active ?? 0,
      total: bp?.mrr ?? 0,
    };
  });

  const failed = (failedSellers ?? []) as {
    id: string; email: string; plan: string;
    last_payment_failed_at: string; last_payment_failed_reason: string | null; payment_failure_count: number;
  }[];

  const rubFmt = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} ₽`;

  return (
    <div className="space-y-8 md:space-y-10">
      <header>
        <div className="inline-flex items-center gap-2">
          <span className="size-1 rounded-full bg-emerald" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald font-semibold">Admin / Finance</span>
        </div>
        <h1 className="mt-2 font-display text-3xl md:text-4xl tracking-tight font-medium">Финансы</h1>
        <p className="mt-1.5 text-ink-muted text-sm">
          MRR по активным подпискам, собранная выручка, платёжные сбои (Robokassa, рубли)
        </p>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Kpi label="MRR" value={rubFmt(mrr)} sub="активные подписки" tone="lime" />
        <Kpi label="ARR" value={rubFmt(arr)} sub="annual run rate" tone="emerald" />
        <Kpi label="ARPU" value={rubFmt(Math.round(arpu))} sub="на активного платника" tone="azure" />
        <Kpi label="Активных платных" value={String(activePaid)} sub={`${trial} в триале · ${lapsedCount} истекли`} tone="lime" />
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Kpi label="Собрано всего" value={rubFmt(collectedTotal)} sub={`${invoicesPaid ?? 0} оплат`} tone="emerald" />
        <Kpi label="Собрано за месяц" value={rubFmt(collectedMonth)} sub="оплаченные инвойсы" tone="lime" />
        <Kpi label="Pending" value={String(invoicesPending ?? 0)} sub="ждём оплату" tone="azure" />
        <Kpi label="Платный план без срока" value={String(ghost)} sub="plan платный, подписки нет" tone="azure" />
      </section>

      <section className="rounded-2xl border border-line bg-paper p-5 md:p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hush">Собрано по неделям · 12 недель</h2>
          <span className="font-mono text-[10px] text-lime-deep font-semibold">{rubFmt(collectedMonth)} за месяц</span>
        </div>
        <MrrChart data={collectedSeries} />
      </section>

      <section>
        <SectionTitle>Активные подписки по планам</SectionTitle>
        <div className="rounded-2xl border border-line bg-paper overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[480px]">
              <div className="grid grid-cols-12 px-4 md:px-5 py-2.5 bg-bg-soft border-b border-line">
                <div className="col-span-4 font-mono text-[10px] uppercase tracking-widest text-ink-hush">План</div>
                <div className="col-span-2 font-mono text-[10px] uppercase tracking-widest text-ink-hush text-right">Цена</div>
                <div className="col-span-2 font-mono text-[10px] uppercase tracking-widest text-ink-hush text-right">Активных</div>
                <div className="col-span-4 font-mono text-[10px] uppercase tracking-widest text-ink-hush text-right">MRR</div>
              </div>
              {revenueByPlan.map(r => (
                <div key={r.plan} className="grid grid-cols-12 px-4 md:px-5 py-3.5 border-b border-line last:border-0 items-center">
                  <div className="col-span-4 font-medium text-sm text-ink">{r.plan}</div>
                  <div className="col-span-2 font-mono text-sm text-ink-muted text-right tabular">{rubFmt(r.price)}</div>
                  <div className="col-span-2 font-mono text-sm text-ink text-right tabular">{r.count}</div>
                  <div className="col-span-4 font-display text-lg text-lime-deep text-right tabular font-medium">{rubFmt(r.total)}</div>
                </div>
              ))}
              <div className="grid grid-cols-12 px-4 md:px-5 py-3.5 bg-bg-soft">
                <div className="col-span-8 font-mono text-[10px] uppercase tracking-widest text-ink font-semibold">Итого MRR</div>
                <div className="col-span-4 font-display text-xl text-ink text-right tabular font-medium">{rubFmt(mrr)}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {failed.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="size-1 rounded-full bg-rose" />
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-rose font-semibold">Платёжные сбои</h2>
          </div>
          <div className="rounded-2xl border border-rose/30 bg-rose/[0.04] overflow-hidden divide-y divide-rose/15">
            {failed.map(f => (
              <a key={f.id} href={`/admin/sellers/${f.id}`} className="flex items-center justify-between px-4 md:px-5 py-3 hover:bg-rose/[0.06] transition gap-3">
                <div className="min-w-0">
                  <div className="text-sm text-ink truncate">{f.email}</div>
                  <div className="font-mono text-[10px] text-ink-hush truncate">
                    {f.plan} · попыток: {f.payment_failure_count}{f.last_payment_failed_reason ? ` · ${f.last_payment_failed_reason}` : ""}
                  </div>
                </div>
                <div className="font-mono text-[10px] text-rose whitespace-nowrap shrink-0">
                  {new Date(f.last_payment_failed_at).toLocaleString("ru-RU")}
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle>Robokassa · последние платежи</SectionTitle>
        {recentInvoices && recentInvoices.length > 0 ? (
          <div className="rounded-2xl border border-line bg-paper overflow-hidden">
            <div className="overflow-x-auto">
              <div className="min-w-[560px]">
                <div className="grid grid-cols-12 px-4 md:px-5 py-2.5 bg-bg-soft border-b border-line">
                  <div className="col-span-2 font-mono text-[10px] uppercase tracking-widest text-ink-hush">InvId</div>
                  <div className="col-span-4 font-mono text-[10px] uppercase tracking-widest text-ink-hush">Селлер</div>
                  <div className="col-span-2 font-mono text-[10px] uppercase tracking-widest text-ink-hush">План</div>
                  <div className="col-span-2 font-mono text-[10px] uppercase tracking-widest text-ink-hush text-right">Сумма</div>
                  <div className="col-span-2 font-mono text-[10px] uppercase tracking-widest text-ink-hush text-right">Статус</div>
                </div>
                {recentInvoices.map((inv: any) => {
                  const seller = Array.isArray(inv.sellers) ? inv.sellers[0] : inv.sellers;
                  const statusCls = inv.status === "paid" ? "text-emerald" : inv.status === "pending" ? "text-azure" : "text-rose";
                  return (
                    <div key={inv.id} className="grid grid-cols-12 px-4 md:px-5 py-3 border-b border-line last:border-0 text-sm items-center">
                      <div className="col-span-2 font-mono text-ink-muted">#{inv.inv_id}</div>
                      <div className="col-span-4 truncate text-ink">{seller?.email ?? "—"}</div>
                      <div className="col-span-2 font-mono text-ink-muted">{inv.plan}</div>
                      <div className="col-span-2 font-display tabular text-right text-ink">{rubFmt(Number(inv.amount))}</div>
                      <div className={`col-span-2 font-mono text-xs uppercase tracking-widest text-right ${statusCls}`}>{inv.status}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line bg-paper p-8 text-center text-sm text-ink-muted">
            Пока нет платежей. Первые invoices появятся после первой попытки оплаты через ЛК.
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "lime" | "emerald" | "azure" }) {
  const accent = tone === "lime" ? "text-lime-deep" : tone === "emerald" ? "text-emerald" : "text-azure";
  return (
    <div className="bg-paper border border-line rounded-2xl p-5 md:p-6">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hush">{label}</div>
      <div className={`mt-2 font-display text-2xl md:text-3xl tracking-tight tabular font-medium ${accent}`}>{value}</div>
      <div className="mt-1 font-mono text-[10px] text-ink-hush">{sub}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="size-1 rounded-full bg-emerald" />
      <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald font-semibold">{children}</h2>
    </div>
  );
}
