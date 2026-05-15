import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY не задан в env");
  _stripe = new Stripe(key, { apiVersion: "2024-06-20" });
  return _stripe;
}

// Маппинг тарифов на Stripe price ID
export const STRIPE_PRICES: Record<string, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER,
  growth: process.env.STRIPE_PRICE_GROWTH,
  pro: process.env.STRIPE_PRICE_PRO,
};

export const PLAN_BY_PRICE: Record<string, string> = Object.entries(STRIPE_PRICES)
  .filter(([, v]) => !!v)
  .reduce((acc, [plan, price]) => ({ ...acc, [price!]: plan }), {});
