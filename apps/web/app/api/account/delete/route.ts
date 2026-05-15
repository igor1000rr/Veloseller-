import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * GDPR Article 17 — Right to erasure ("right to be forgotten").
 *
 * Удаляет все данные пользователя:
 *  - Каскадно удаляет seller → products → snapshots/events/metrics/alerts/changelog
 *  - Удаляет data_connections
 *  - Удаляет user из Supabase auth.users
 *
 * Требует подтверждения через body: { confirm: "DELETE-MY-ACCOUNT" }
 * — защита от accidental delete.
 */
export async function DELETE(req: NextRequest) {
  const sb = await createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Confirmation phrase
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

  // Cascading delete. RLS не мешает service-role клиенту.
  // Order: продукты-зависимые таблицы первыми (на случай отсутствия ON DELETE CASCADE).
  try {
    const productsRes = await admin.from("products").select("product_id").eq("seller_id", sellerId);
    const productIds = (productsRes.data || []).map(p => p.product_id);

    if (productIds.length > 0) {
      await admin.from("inventory_events").delete().in("product_id", productIds);
      await admin.from("inventory_snapshots").delete().in("product_id", productIds);
      await admin.from("tvelo_metrics").delete().in("product_id", productIds);
      await admin.from("price_elasticity").delete().in("product_id", productIds);
    }

    await admin.from("alerts").delete().eq("seller_id", sellerId);
    await admin.from("changelog").delete().eq("seller_id", sellerId);
    await admin.from("store_metrics").delete().eq("seller_id", sellerId);
    await admin.from("products").delete().eq("seller_id", sellerId);
    await admin.from("data_connections").delete().eq("seller_id", sellerId);
    await admin.from("sellers").delete().eq("id", sellerId);

    // Удаляем auth user (требует service-role)
    await admin.auth.admin.deleteUser(sellerId);
  } catch (e: any) {
    return NextResponse.json({
      error: "Deletion partially failed. Contact support@veloseller.com.",
      detail: e?.message || String(e),
    }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: "Аккаунт удалён. Бэкапы будут удалены в течение 30 дней.",
  });
}
