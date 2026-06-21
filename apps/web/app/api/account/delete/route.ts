import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { requireUser, jsonError } from "@/lib/auth";
import { batchedInDelete } from "@/lib/supabase/batched";

/**
 * GDPR Article 17 — Right to erasure.
 *
 * БАГ 15 fix: .in("product_id", ...) батчится через batchedInDelete.
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

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

  try {
    // GDPR: удаляем файлы отчётов из Storage ДО удаления строк report_history
    // (они снимаются каскадом при удалении sellers). Бакет report-files приватный,
    // путь = "<seller_id>/<дата>/<файл>". Сбой Storage не должен блокировать
    // удаление аккаунта — логируем и продолжаем.
    try {
      const { data: reportRows } = await admin
        .from("report_history")
        .select("storage_path")
        .eq("seller_id", sellerId)
        .not("storage_path", "is", null);
      const paths = (reportRows || [])
        .map((r) => r.storage_path as string)
        .filter(Boolean);
      if (paths.length > 0) {
        const { error: rmErr } = await admin.storage.from("report-files").remove(paths);
        if (rmErr) {
          console.error("[account-delete] Storage cleanup failed", { sellerId, error: rmErr.message });
        } else {
          console.log("[account-delete] Storage report files removed", { sellerId, count: paths.length });
        }
      }
    } catch (e: any) {
      console.error("[account-delete] Storage cleanup exception", { sellerId, error: e?.message });
    }

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
    // Деталь сбоя удаления — только в логи, наружу общий текст (без SQL/детали).
    return jsonError(500, "Deletion partially failed.", e);
  }

  return NextResponse.json({
    success: true,
    message: "Аккаунт удалён. Бэкапы будут удалены в течение 30 дней.",
  });
}
