import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { MrrChart } from "../AdminCharts";

export const dynamic = "force-dynamic";

// Рублевые цены (Robokassa). Должны совпадать с PLAN_PRICES в lib/robokassa.ts.
const PLAN_PRICE_RUB: Record<string, number> = {
  trial: 0,
  starter: 2500,
  growth: 6900,
  pro: 14900,
};

export default async function FinancePage() {
  const supabase = createSupabaseAdminClient();

  const [
    { data: sellers },
    { count: starterC }, { count: growthC }, { count: proC }, { count: trialC },
    { count: invoicesPaid }, { count: invoicesPending },
    { data: recentInvoices },
  ] = await Promise.all([
    supabase.from("sellers").select("id,plan,created_at"),
    supabase.from("sellers").select("id", { count: "exact", head: true }).eq("plan", "starter"),
    supabase.from("sellers").select("id", { count: "exact", head: true }).eq("plan", "growth"),
    supabase.from("sellers").select("id", { count: "exact", head: true }).eq("plan", "pro"),
    supabase.from("sellers").select("id", { count: "exact", head: true }).eq("plan", "trial"),
    supabase.from("robokassa_invoices").select("id", { count: "exact", head: true }).eq("status", "paid"),
    supabase.from("robokassa_invoices").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("robokassa_invoices")
      .select("id,inv_id,plan,amount,status,paid_at,created_at,seller_id,sellers(email)")
      .order("created_at", { ascending: false }).limit(10),
  ]);

  const starter = starterC ?? 0, growth = growthC ?? 0, pro = proC ?? 0, trial = trialC ?? 0;
  const mrr = starter * PLAN_PRICE_RUB.starter + growth * PLAN_PRICE_RUB.growth + pro * PLAN_PRICE_RUB.pro;
  const arr = mrr * 12;
  const paidTotal = starter + growth + pro;
  const arpu = paidTotal > 0 ? mrr / paidTotal : 0;

  // История MRR по неделям
  const today = new Date();
  const weeksBack = 12;
  const mrrSeries: { date: string; mrr: number }[] = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    const at = new Date(today.getTime() - i * 7 * 86400_000);
    const mrrAt = (sellers ?? []).reduce((sum: number, s: any) => {
      if (new Date(s.created_at) > at) return sum;
      return sum + (PLAN_PRICE_RUB[s.plan] || 0);
    }, 0);
    mrrSeries.push({
      date: at.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
      mrr: mrrAt,
    });
  }

  const revenueByPlan = [
    { plan: "Starter", price: PLAN_PRICE_RUB.starter, count: starter, total: starter * PLAN_PRICE_RUB.starter },
    { plan: "Growth",  price: PLAN_PRICE_RUB.growth,  count: growth,  total: growth  * PLAN_PRICE_RUB.growth },
    { plan: "Pro",     price: PLAN_PRICE_RUB.pro,     count: pro,     total: pro     * PLAN_PRICE_RUB.pro },
  ];

  const rubFmt = (n: number) => `${n.toLocaleString("ru-RU")} ₽`;

  return (
    <div className="space-y-8 md:space-y-10">
      <header>
        <div className="inline-flex items-center gap-2">
          <span className="size-1 rounded-full bg-emerald" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald font-semibold">Admin / Finance</span>
        </div>
        <h1 className="mt-2 font-display text-3xl md:text-4xl tracking-tight font-medium">Финансы</h1>
        <p className="mt-1.5 text-ink-muted text-sm">MRR, ARR, ARPU, распределение выручки по планам (Robokassa, рубли)</p>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Kpi label="MRR"              value={rubFmt(mrr)} sub="monthly recurring" tone="lime" />
        <Kpi label="ARR"              value={rubFmt(arr)} sub="annual run rate"   tone="emerald" />
        <Kpi label="ARPU"             value={rubFmt(Math.round(arpu))} sub="на платного селлера" tone="azure" />
        <Kpi label="Платных селлеров" value={paidTotal.toString()} sub={`${trial} в триале`} tone="lime" />
      </section>

      <section className="rounded-2xl border border-line bg-paper p-5 md:p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hush">MRR · 12 недель</h2>
          <span className="font-mono text-[10px] text-lime-deep font-semibold">{rubFmt(mrr)} сейчас</span>
        </div>
        <MrrChart data={mrrSeries} />
      </section>

      <section>
        <SectionTitle>Распределение выручки по планам</SectionTitle>
        <div className="rounded-2xl border border-line bg-paper overflow-hidden">
          <div className="grid grid-cols-12 px-4 md:px-5 py-2.5 bg-bg-soft border-b border-line">
            <div className="col-span-4 font-mono text-[10px] uppercase tracking-widest text-ink-hush">План</div>
            <div className="col-span-2 font-mono text-[10px] uppercase tracking-widest text-ink-hush text-right">Цена</div>
            <div className="col-span-2 font-mono text-[10px] uppercase tracking-widest text-ink-hush text-right">Селлеры</div>
            <div className="col-span-4 font-mono text-[10px] uppercase tracking-widest text-ink-hush text-right">Выручка/мес</div>
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
      </section>

      {/* Robokassa платежи */}
      <section>
        <SectionTitle>Robokassa · платежи</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Kpi label="Оплаченных invoices" value={(invoicesPaid ?? 0).toString()} sub="всего" tone="emerald" />
          <Kpi label="Pending" value={(invoicesPending ?? 0).toString()} sub="ждём оплату" tone="azure" />
        </div>
        {recentInvoices && recentInvoices.length > 0 ? (
          <div className="rounded-2xl border border-line bg-paper overflow-hidden">
            <div className="grid grid-cols-12 px-4 md:px-5 py-2.5 bg-bg-soft border-b border-line">
              <div className="col-span-2 font-mono text-[10px] uppercase tracking-widest text-ink-hush">InvId</div>
              <div className="col-span-4 font-mono text-[10px] uppercase tracking-widest text-ink-hush">Селлер</div>
              <div className="col-span-2 font-mono text-[10px] uppercase tracking-widest text-ink-hush">План</div>
              <div className="col-span-2 font-mono text-[10px] uppercase tracking-widest text-ink-hush text-right">Сумма</div>
              <div className="col-span-2 font-mono text-[10px] uppercase tracking-widest text-ink-hush text-right">Статус</div>
            </div>
            {recentInvoices.map((inv: any) => {
              const seller = Array.isArray(inv.sellers) ? inv.sellers[0] : inv.sellers;
              const statusCls = inv.status === "paid"   ? "text-emerald"
                              : inv.status === "pending" ? "text-azure"
                              :                            "text-rose";
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
      <div className={`mt-2 font-display text-3xl md:text-4xl tracking-tight tabular font-medium ${accent}`}>{value}</div>
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
