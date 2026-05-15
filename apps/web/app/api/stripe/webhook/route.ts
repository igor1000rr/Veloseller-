import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { getStripe, PLAN_BY_PRICE } from "@/lib/stripe";

// Webhook требует raw body — отключаем парсинг
export const runtime = "nodejs";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return NextResponse.json({ error: "Missing signature or secret" }, { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, secret);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook signature error: ${err.message}` }, { status: 400 });
  }

  const sb = adminClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const sellerId = (session.subscription && typeof session.subscription === "object"
        ? (session.subscription as any)?.metadata?.seller_id
        : undefined) || session.metadata?.seller_id;

      if (session.subscription && typeof session.subscription === "string") {
        const sub = await getStripe().subscriptions.retrieve(session.subscription);
        await applySubscription(sb, sub);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      await applySubscription(sb, sub);
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const sellerId = sub.metadata?.seller_id;
      if (sellerId) {
        await sb.from("sellers").update({
          plan: "trial",
          subscription_status: "canceled",
          stripe_subscription_id: null,
        }).eq("id", sellerId);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}

async function applySubscription(sb: ReturnType<typeof adminClient>, sub: Stripe.Subscription) {
  const sellerId = sub.metadata?.seller_id;
  if (!sellerId) return;
  const priceId = sub.items.data[0]?.price.id;
  const plan = priceId ? PLAN_BY_PRICE[priceId] : undefined;
  const update: Record<string, unknown> = {
    stripe_subscription_id: sub.id,
    subscription_status: sub.status,
    current_period_end: new Date((sub as any).current_period_end * 1000).toISOString(),
  };
  if (plan) update.plan = plan;
  await sb.from("sellers").update(update).eq("id", sellerId);
}
