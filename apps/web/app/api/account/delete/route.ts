import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { batchedInDelete } from "@/lib/supabase/batched";
import { getStripe } from "@/lib/stripe";

/**
 * GDPR Article 17 — Right to erasure.
 *
 * БАГ 15 fix: .in("product_id", ...) батчится через batchedInDelete.
 * БАГ 54 fix: перед удалением аккаунта отменяем Stripe subscription.
 *   Раньше если у seller'а была активная подписка, удаление аккаунта НЕ останавливало
 *   billing — Stripe продолжал charging. GDPR нарушение и финансовая претензия.
 */
export async function DELETE(req: NextRequest) {
  const sb = await createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = enforceRateLimit(req, RATE_LIMITS.SENSITIVE, user.id);
  if (limited) return limited;

  let body: { confirm?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body.confirm !== "DELETE-MY-ACCOUNT") {
    return NextResponse.json({
      error: "Confirmation required. Send body: { confirm: 'DELETE-MY-ACCOUNT' }"
    }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const sellerId = user.id;

  // БАГ 54: cancel Stripe subscription ПЕРЕД удалением аккаунта
  // Если падает — продолжаем удаление, но логируем (seller всё равно потерял доступ)
  try {
    const { data: seller } = await admin
      .from("sellers")
      .select("stripe_subscription_id, stripe_customer_id")
      .eq("id", sellerId)
      .maybeSingle();
    if (seller?.stripe_subscription_id) {
      try {
        const stripe = getStripe();
        await stripe.subscriptions.cancel(seller.stripe_subscription_id);
        console.log("[account-delete] Stripe subscription cancelled", { sellerId });
      } catch (e: any) {
        console.error("[account-delete] Stripe subscription cancel failed", {
          sellerId, error: e?.message,
        });
      }
    }
    if (seller?.stripe_customer_id) {
      try {
        const stripe = getStripe();
        await stripe.customers.del(seller.stripe_customer_id);
        console.log("[account-delete] Stripe customer deleted", { sellerId });
      } catch (e: any) {
        console.error("[account-delete] Stripe customer delete failed", {
          sellerId, error: e?.message,
        });
      }
    }
  } catch (e: any) {
    console.error("[account-delete] Stripe cleanup failed", { sellerId, error: e?.message });
  }

  try {
    const productsRes = await admin.from("products").select("product_id").eq("seller_id", sellerId);
    const productIds = (productsRes.data || []).map(p => p.product_id);

    if (productIds.length > 0) {
      await batchedInDelete(
        (batch) => admin.from("inventory_events").delete().in("product_id", batch),
        productIds,
      );
      await batchedInDelete(
        (batch) => admin.from("inventory_snapshots").delete().in("product_id", batch),
        productIds,
      );
      await batchedInDelete(
        (batch) => admin.from("tvelo_metrics").delete().in("product_id", batch),
        productIds,
      );
      await batchedInDelete(
        (batch) => admin.from("price_elasticity").delete().in("product_id", batch),
        productIds,
      );
    }

    await admin.from("alerts").delete().eq("seller_id", sellerId);
    await admin.from("changelog").delete().eq("seller_id", sellerId);
    await admin.from("store_metrics").delete().eq("seller_id", sellerId);
    await admin.from("products").delete().eq("seller_id", sellerId);
    await admin.from("data_connections").delete().eq("seller_id", sellerId);
    await admin.from("sellers").delete().eq("id", sellerId);
    await admin.auth.admin.deleteUser(sellerId);
  } catch (e: any) {
    return NextResponse.json({
      error: "Deletion partially failed.",
      detail: e?.message || String(e),
    }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: "Аккаунт удалён. Подписка Stripe отменена. Бэкапы будут удалены в течение 30 дней.",
  });
}
