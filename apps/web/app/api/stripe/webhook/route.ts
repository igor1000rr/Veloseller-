import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { getStripe, PLAN_BY_PRICE } from "@/lib/stripe";

export const runtime = "nodejs";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Stripe webhook handler.
 *
 * БАГ 46-47 fix:
 *  - Логируем все events
 *  - current_period_end из sub.items.data[0] (deprecated на верхнем уровне в новых API)
 *  - try/catch вокруг applySubscription (если упало, возвращаем 200 чтобы Stripe не retry'ил)
 *
 * БАГ 62 fix: customer.subscription.deleted проверяет что sub.id совпадает с
 *   текущим stripe_subscription_id в БД. Иначе при out-of-order delivery старый
 *   "deleted" webhook сбрасывал новую активную подписку.
 */
export async function POST(req: NextRequest) {
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

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
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
          // БАГ 62: проверяем что это текущая активная подписка
          // (защита от out-of-order delivery — старый "deleted" не сбрасывает новую)
          const { data: seller } = await sb.from("sellers")
            .select("stripe_subscription_id")
            .eq("id", sellerId)
            .maybeSingle();
          if (seller?.stripe_subscription_id && seller.stripe_subscription_id !== sub.id) {
            console.warn("[stripe-webhook] deleted event ignored — seller has different active subscription", {
              sellerId, deleted_sub: sub.id, current_sub: seller.stripe_subscription_id,
            });
            break;
          }
          await sb.from("sellers").update({
            plan: "trial",
            subscription_status: "canceled",
            stripe_subscription_id: null,
          }).eq("id", sellerId);
        }
        break;
      }
    }
  } catch (err: any) {
    console.error("[stripe-webhook] handler failed", { type: event.type, error: err?.message });
  }

  return NextResponse.json({ received: true });
}

async function applySubscription(sb: ReturnType<typeof adminClient>, sub: Stripe.Subscription) {
  const sellerId = sub.metadata?.seller_id;
  if (!sellerId) {
    console.warn("[stripe-webhook] subscription without seller_id", { sub_id: sub.id });
    return;
  }
  const priceId = sub.items.data[0]?.price.id;
  const plan = priceId ? PLAN_BY_PRICE[priceId] : undefined;

  const rawPeriodEnd = (sub as any).current_period_end ?? sub.items.data[0]?.current_period_end;
  const periodEndIso = (typeof rawPeriodEnd === "number" && rawPeriodEnd > 0)
    ? new Date(rawPeriodEnd * 1000).toISOString()
    : null;

  const update: Record<string, unknown> = {
    stripe_subscription_id: sub.id,
    subscription_status: sub.status,
    current_period_end: periodEndIso,
  };
  if (plan) update.plan = plan;
  const { error } = await sb.from("sellers").update(update).eq("id", sellerId);
  if (error) {
    console.error("[stripe-webhook] DB update failed", { sellerId, error: error.message });
  }
}
