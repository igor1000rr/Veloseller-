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
 *
 * БАГ 103 fix: обрабатываем invoice.payment_failed и invoice.payment_succeeded
 *   для tracking платёжных событий. Без этого UI не мог показать клиенту что
 *   платёж не прошёл — приходилось ждать customer.subscription.updated со
 *   status='past_due', что бывает не всегда сразу.
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
      case "invoice.payment_failed": {
        // БАГ 103: фиксируем неудачный платёж.
        // Stripe Smart Retries попробует ещё раз; здесь мы только метим факт.
        const invoice = event.data.object as Stripe.Invoice;
        await applyPaymentFailed(sb, invoice);
        break;
      }
      case "invoice.payment_succeeded": {
        // БАГ 103: сбрасываем счётчик неудачных платежей.
        const invoice = event.data.object as Stripe.Invoice;
        await applyPaymentSucceeded(sb, invoice);
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

  const rawPeriodEnd = (sub as any).current_period_end ?? (sub.items.data[0] as any)?.current_period_end;
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

/**
 * БАГ 103: invoice.payment_failed handler.
 *
 * Ищем seller по invoice.subscription.metadata.seller_id (предпочтительно)
 * или по stripe_customer_id (fallback).
 */
async function applyPaymentFailed(sb: ReturnType<typeof adminClient>, invoice: Stripe.Invoice) {
  const sellerId = await resolveSellerFromInvoice(sb, invoice);
  if (!sellerId) {
    console.warn("[stripe-webhook] invoice.payment_failed: seller not found", {
      invoice_id: invoice.id, customer: invoice.customer,
    });
    return;
  }

  // Извлекаем причину из last_finalization_error или billing_reason
  const reason =
    (invoice as any).last_finalization_error?.message
    || invoice.billing_reason
    || "payment_failed";

  // Атомарный increment счётчика. Используем RPC через update + select.
  // Минимально безопасно: SELECT текущий, +1, UPDATE. Race возможен но не критичен.
  const { data: current } = await sb.from("sellers")
    .select("payment_failure_count")
    .eq("id", sellerId)
    .maybeSingle();
  const newCount = ((current?.payment_failure_count as number | undefined) ?? 0) + 1;

  const { error } = await sb.from("sellers").update({
    last_payment_failed_at: new Date().toISOString(),
    last_payment_failed_reason: String(reason).slice(0, 500),
    payment_failure_count: newCount,
  }).eq("id", sellerId);

  if (error) {
    console.error("[stripe-webhook] payment_failed DB update error", {
      sellerId, error: error.message,
    });
  } else {
    console.info("[stripe-webhook] payment_failed recorded", {
      sellerId, invoice_id: invoice.id, count: newCount,
    });
  }
}

/**
 * БАГ 103: invoice.payment_succeeded handler.
 * Сбрасывает счётчик неудачных платежей и обновляет timestamp успеха.
 */
async function applyPaymentSucceeded(sb: ReturnType<typeof adminClient>, invoice: Stripe.Invoice) {
  const sellerId = await resolveSellerFromInvoice(sb, invoice);
  if (!sellerId) {
    // Без seller_id это не наш платёж — silently ignore
    return;
  }

  const { error } = await sb.from("sellers").update({
    last_payment_succeeded_at: new Date().toISOString(),
    last_payment_failed_at: null,
    last_payment_failed_reason: null,
    payment_failure_count: 0,
  }).eq("id", sellerId);

  if (error) {
    console.error("[stripe-webhook] payment_succeeded DB update error", {
      sellerId, error: error.message,
    });
  }
}

/**
 * Резолвит seller_id из Stripe Invoice.
 *
 * Приоритет:
 *   1. invoice.subscription_details.metadata.seller_id (Stripe 2024+)
 *   2. retrieve subscription и взять sub.metadata.seller_id
 *   3. lookup по invoice.customer → sellers.stripe_customer_id
 *
 * Возвращает null если seller не найден.
 */
async function resolveSellerFromInvoice(
  sb: ReturnType<typeof adminClient>,
  invoice: Stripe.Invoice,
): Promise<string | null> {
  // Попытка 1: subscription_details.metadata (новое API)
  const subDetailsMeta = (invoice as any).subscription_details?.metadata?.seller_id;
  if (typeof subDetailsMeta === "string" && subDetailsMeta) return subDetailsMeta;

  // Попытка 2: retrieve subscription
  const subId = (invoice as any).subscription;
  if (typeof subId === "string" && subId) {
    try {
      const sub = await getStripe().subscriptions.retrieve(subId);
      const subMeta = sub.metadata?.seller_id;
      if (typeof subMeta === "string" && subMeta) return subMeta;
    } catch (err: any) {
      console.warn("[stripe-webhook] failed to retrieve subscription for seller lookup", {
        sub_id: subId, error: err?.message,
      });
    }
  }

  // Попытка 3: lookup по stripe_customer_id
  const customerId = typeof invoice.customer === "string"
    ? invoice.customer
    : invoice.customer?.id;
  if (customerId) {
    const { data: seller } = await sb.from("sellers")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (seller?.id) return seller.id as string;
  }

  return null;
}
