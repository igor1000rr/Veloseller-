/**
 * Расчёт MRR только по АКТИВНЫМ платным подпискам Veloseller.
 *
 * Истёкшая подписка (subscription_expires_at в прошлом) в MRR не входит —
 * иначе «повисшие» на платном плане селлеры завышают выручку. null в
 * subscription_expires_at трактуем как активную (выдана вручную / legacy).
 */
import { PLAN_PRICES, type VeloseLLerPlan } from "@/lib/robokassa";

const VELO_PLANS: VeloseLLerPlan[] = ["starter", "growth", "pro"];

export type SellerBillingRow = {
  plan: string | null;
  subscription_expires_at?: string | null;
  last_payment_failed_at?: string | null;
  payment_failure_count?: number | null;
};

export type MrrBreakdown = {
  mrr: number;
  activePaid: number;
  lapsedCount: number;
  lapsedMrr: number;
  atRisk: number;
  byPlan: { plan: VeloseLLerPlan; price: number; active: number; mrr: number }[];
};

export function computeMrr(rows: SellerBillingRow[], now: Date = new Date()): MrrBreakdown {
  const byPlanMap: Record<VeloseLLerPlan, { active: number; mrr: number }> = {
    starter: { active: 0, mrr: 0 },
    growth: { active: 0, mrr: 0 },
    pro: { active: 0, mrr: 0 },
  };
  let mrr = 0;
  let activePaid = 0;
  let lapsedCount = 0;
  let lapsedMrr = 0;
  let atRisk = 0;

  for (const r of rows) {
    const plan = (r.plan ?? "") as VeloseLLerPlan;
    if (!VELO_PLANS.includes(plan)) continue;
    const price = PLAN_PRICES[plan] ?? 0;
    const lapsed = !!r.subscription_expires_at
      && new Date(r.subscription_expires_at).getTime() <= now.getTime();
    if (lapsed) {
      lapsedCount++;
      lapsedMrr += price;
      continue;
    }
    mrr += price;
    activePaid++;
    byPlanMap[plan].active++;
    byPlanMap[plan].mrr += price;
    if (r.last_payment_failed_at && Number(r.payment_failure_count ?? 0) > 0) atRisk++;
  }

  const byPlan = VELO_PLANS.map(p => ({
    plan: p,
    price: PLAN_PRICES[p] ?? 0,
    active: byPlanMap[p].active,
    mrr: byPlanMap[p].mrr,
  }));

  return { mrr, activePaid, lapsedCount, lapsedMrr, atRisk, byPlan };
}
