import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe, STRIPE_PRICES } from "@/lib/stripe";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { plan } = await req.json().catch(() => ({}));
  const priceId = STRIPE_PRICES[plan as string];
  if (!priceId) return NextResponse.json({ error: `Unknown plan ${plan} or STRIPE_PRICE_${(plan ?? "").toUpperCase()} не задан` }, { status: 400 });

  // Получаем/создаём stripe customer
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

  const origin = req.headers.get("origin") || `https://${req.headers.get("host")}`;

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
