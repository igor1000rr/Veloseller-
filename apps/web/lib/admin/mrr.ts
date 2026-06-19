/**
 * Подсчёт MRR и состояния подписок для админ-финансов.
 *
 * Истина о платящем клиенте — subscription_expires_at (см. комментарий колонки в БД:
 * NULL = trial, прошедшая дата = откат в trial). Поэтому MRR считается ТОЛЬКО по
 * селлерам с активной подпиской (expires_at > now), а не по колонке plan, которая
 * может остаться 'pro' у уже истёкшего или неактивированного аккаунта.
 */
import { PLAN_PRICES } from "@/lib/robokassa";

const PAID_PLANS = ["starter", "growth", "pro"] as const;

export type SellerBillingRow = {
  plan: string;
  subscription_expires_at: string | null;
};

export type MrrBreakdown = {
  mrr: number;
  activePaid: number;
  lapsed: number; // платный план, подписка истекла (expires_at <= now)
  ghost: number;  // платный план, но subscription_expires_at = null (фактически trial)
  byPlan: Record<string, { active: number; revenue: number }>;
};

function isPaid(plan: string): boolean {
  return (PAID_PLANS as readonly string[]).includes(plan);
}

export function computeMrr(rows: SellerBillingRow[], now: Date = new Date()): MrrBreakdown {
  const nowMs = now.getTime();
  let mrr = 0, activePaid = 0, lapsed = 0, ghost = 0;
  const byPlan: Record<string, { active: number; revenue: number }> = {};

  for (const r of rows) {
    if (!isPaid(r.plan)) continue;
    const price = (PLAN_PRICES as Record<string, number>)[r.plan] ?? 0;
    if (r.subscription_expires_at == null) { ghost++; continue; }
    const exp = new Date(r.subscription_expires_at).getTime();
    if (exp > nowMs) {
      activePaid++;
      mrr += price;
      byPlan[r.plan] ??= { active: 0, revenue: 0 };
      byPlan[r.plan].active++;
      byPlan[r.plan].revenue += price;
    } else {
      lapsed++;
    }
  }
  return { mrr, activePaid, lapsed, ghost, byPlan };
}
