import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe, STRIPE_PRICES } from "@/lib/stripe";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * POST /api/stripe/checkout — создаёт Stripe Checkout Session.
 *
 * БАГ 48 fix: rate limit (создание sessions стоит Stripe API calls — не даём спамить).
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit(req, RATE_LIMITS.WRITE, user.id);
  if (limited) return limited;

  const { plan } = await req.json().catch(() => ({}));
  const priceId = STRIPE_PRICES[plan as string];
  if (!priceId) return NextResponse.json({ error: `Unknown plan ${plan} or STRIPE_PRICE_${(plan ?? "").toUpperCase()} не задан` }, { status: 400 });

  const { data: seller } = await supabase
    .from("sellers").select("stripe_customer_id,email").eq("id", user.id).single();
  let customerId = seller?.stripe_customer_id;
  const stripe = getStripe();

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: seller?.email ?? user.email ?? undefined,
      metadata: { seller_id: user.id },
    });
    customerId = customer.id;
    await supabase.from("sellers").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  const origin = req.headers.get("origin") || `https://${req.headers.get("host") || "veloseller.ru"}`;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    mode: "subscription",
    success_url: `${origin}/billing?upgraded=1`,
    cancel_url: `${origin}/billing?canceled=1`,
    allow_promotion_codes: true,
    subscription_data: { metadata: { seller_id: user.id } },
  });

  return NextResponse.json({ url: session.url });
}
