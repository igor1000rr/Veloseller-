import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { MrrChart } from "../AdminCharts";

export const dynamic = "force-dynamic";

const PLAN_PRICE: Record<string, number> = { trial: 0, starter: 24, growth: 89, pro: 299 };

export default async function FinancePage() {
  const supabase = createSupabaseAdminClient();

  const [
    { data: sellers },
    { count: starterC }, { count: growthC }, { count: proC }, { count: trialC },
  ] = await Promise.all([
    supabase.from("sellers").select("id,plan,created_at"),
    supabase.from("sellers").select("id", { count: "exact", head: true }).eq("plan", "starter"),
    supabase.from("sellers").select("id", { count: "exact", head: true }).eq("plan", "growth"),
    supabase.from("sellers").select("id", { count: "exact", head: true }).eq("plan", "pro"),
    supabase.from("sellers").select("id", { count: "exact", head: true }).eq("plan", "trial"),
  ]);

  const starter = starterC ?? 0, growth = growthC ?? 0, pro = proC ?? 0, trial = trialC ?? 0;
  const mrr = starter * 24 + growth * 89 + pro * 299;
  const arr = mrr * 12;
  const paidTotal = starter + growth + pro;
  const arpu = paidTotal > 0 ? mrr / paidTotal : 0;

  // История MRR по неделям на основе дат создания селлеров (аппроксимация — нарастающий MRR на тот момент)
  const today = new Date();
  const weeksBack = 12;
  const mrrSeries: { date: string; mrr: number }[] = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    const at = new Date(today.getTime() - i * 7 * 86400_000);
    const mrrAt = (sellers ?? []).reduce((sum: number, s: any) => {
      if (new Date(s.created_at) > at) return sum;
      return sum + (PLAN_PRICE[s.plan] || 0);
    }, 0);
    mrrSeries.push({
      date: at.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
      mrr: mrrAt,
    });
  }

  const revenueByPlan = [
    { plan: "Starter", price: 24,  count: starter, total: starter * 24 },
    { plan: "Growth",  price: 89,  count: growth,  total: growth * 89 },
    { plan: "Pro",     price: 299, count: pro,     total: pro * 299 },
  ];

  return (
    <div className="space-y-8 md:space-y-10">
      <header>
        <div className="inline-flex items-center gap-2">
          <span className="size-1 rounded-full bg-emerald" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald font-semibold">Admin / Finance</span>
        </div>
        <h1 className="mt-2 font-display text-3xl md:text-4xl tracking-tight font-medium">Финансы</h1>
        <p className="mt-1.5 text-ink-muted text-sm">MRR, ARR, ARPU, распределение выручки по планам</p>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Kpi label="MRR"           value={`$${mrr.toLocaleString("ru-RU")}`}  sub="monthly recurring" tone="lime" />
        <Kpi label="ARR"           value={`$${arr.toLocaleString("ru-RU")}`}  sub="annual run rate" tone="emerald" />
        <Kpi label="ARPU"          value={`$${arpu.toFixed(0)}`}              sub={`на платного селлера`} tone="azure" />
        <Kpi label="Платных селлеров" value={paidTotal.toString()}              sub={`${trial} в триале`} tone="lime" />
      </section>

      <section className="rounded-2xl border border-line bg-paper p-5 md:p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hush">MRR · 12 недель</h2>
          <span className="font-mono text-[10px] text-lime-deep font-semibold">${mrr.toLocaleString("ru-RU")} сейчас</span>
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
              <div className="col-span-2 font-mono text-sm text-ink-muted text-right tabular">${r.price}</div>
              <div className="col-span-2 font-mono text-sm text-ink text-right tabular">{r.count}</div>
              <div className="col-span-4 font-display text-lg text-lime-deep text-right tabular font-medium">${r.total.toLocaleString("ru-RU")}</div>
            </div>
          ))}
          <div className="grid grid-cols-12 px-4 md:px-5 py-3.5 bg-bg-soft">
            <div className="col-span-8 font-mono text-[10px] uppercase tracking-widest text-ink font-semibold">Итого MRR</div>
            <div className="col-span-4 font-display text-xl text-ink text-right tabular font-medium">${mrr.toLocaleString("ru-RU")}</div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-azure/30 bg-azure/[0.05] p-5 md:p-6">
        <div className="flex items-start gap-3">
          <div className="size-9 rounded-lg bg-azure/15 border border-azure/30 text-azure flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 1v16M3 5h9a3 3 0 010 6H6a3 3 0 000 6h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          </div>
          <div>
            <h3 className="font-display text-base font-medium text-ink">Stripe и реальные транзакции</h3>
            <p className="mt-1 text-sm text-ink-muted">
              Выручка посчитана по текущему распределению планов, без учёта скидок и promo. Когда Stripe-выплаты
              работают в проде, здесь появится таблица реальных транзакций с webhook-подтверждениями.
            </p>
          </div>
        </div>
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
