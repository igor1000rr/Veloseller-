import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { batchedIn } from "@/lib/supabase/batched";

/**
 * GDPR Article 20 — Data portability.
 *
 * Экспортирует все данные пользователя в JSON. Запускается из /account по кнопке.
 *
 * БАГ 15 fix: .in("product_id", productIds) теперь батчится.
 * БАГ 58 fix: data_connections.select содержал колонку 'kind' которой нет —
 *   реально есть 'source' и 'marketplace'. Экспорт падал с 500. GDPR Art. 20 violation.
 */
export async function GET(req: NextRequest) {
  const sb = await createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit — GDPR запросы очень редкие
  const limited = enforceRateLimit(req, RATE_LIMITS.SENSITIVE, user.id);
  if (limited) return limited;

  const admin = createSupabaseAdminClient();
  const sellerId = user.id;

  const productsRes = await admin.from("products").select("*").eq("seller_id", sellerId);
  const productIds = (productsRes.data || []).map(p => p.product_id);

  const [seller, snapshots, events, metrics, storeMetrics, alerts, changelog, elasticity, connections] = await Promise.all([
    admin.from("sellers").select("*").eq("id", sellerId).maybeSingle(),
    batchedIn(
      (batch) => admin.from("inventory_snapshots").select("*").in("product_id", batch),
      productIds,
    ),
    batchedIn(
      (batch) => admin.from("inventory_events").select("*").in("product_id", batch),
      productIds,
    ),
    batchedIn(
      (batch) => admin.from("tvelo_metrics").select("*").in("product_id", batch),
      productIds,
    ),
    admin.from("store_metrics").select("*").eq("seller_id", sellerId),
    admin.from("alerts").select("*").eq("seller_id", sellerId),
    admin.from("changelog").select("*").eq("seller_id", sellerId),
    admin.from("price_elasticity").select("*").eq("seller_id", sellerId),
    // БАГ 58: используем правильные колонки (source/marketplace вместо kind)
    admin.from("data_connections")
      .select("id,source,marketplace,name,status,last_sync_at,last_error,created_at")
      .eq("seller_id", sellerId),
  ]);

  const exportData = {
    export_meta: {
      generated_at: new Date().toISOString(),
      user_id: sellerId,
      email: user.email,
      gdpr_article: "Article 20 — Right to data portability",
      format_version: "1.0",
    },
    seller_profile: seller.data || null,
    products: productsRes.data || [],
    inventory_snapshots: snapshots,
    inventory_events: events,
    tvelo_metrics: metrics,
    store_metrics: storeMetrics.data || [],
    alerts: alerts.data || [],
    changelog: changelog.data || [],
    price_elasticity: elasticity.data || [],
    data_connections: connections.data || [],
    note: "API-ключи маркетплейсов исключены из экспорта по соображениям безопасности.",
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="veloseller-export-${sellerId}-${new Date().toISOString().split("T")[0]}.json"`,
    },
  });
}
