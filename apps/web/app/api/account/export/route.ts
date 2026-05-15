import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * GDPR Article 20 — Data portability.
 *
 * Экспортирует все данные пользователя в JSON. Запускается из /account по кнопке.
 * Включает: профиль селлера, products, snapshots, events, метрики, alerts, changelog,
 * price_elasticity, connections (без расшифрованных секретов!).
 */
export async function GET(_req: NextRequest) {
  // Auth check
  const cookieStore = cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    },
  );
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const sellerId = user.id;

  // Собираем все данные параллельно
  const [seller, products, snapshots, events, metrics, storeMetrics, alerts, changelog, elasticity, connections] = await Promise.all([
    admin.from("sellers").select("*").eq("id", sellerId).single(),
    admin.from("products").select("*").eq("seller_id", sellerId),
    admin.from("inventory_snapshots").select("*").in("product_id",
      (await admin.from("products").select("product_id").eq("seller_id", sellerId)).data?.map(p => p.product_id) || []
    ),
    admin.from("inventory_events").select("*").in("product_id",
      (await admin.from("products").select("product_id").eq("seller_id", sellerId)).data?.map(p => p.product_id) || []
    ),
    admin.from("tvelo_metrics").select("*").in("product_id",
      (await admin.from("products").select("product_id").eq("seller_id", sellerId)).data?.map(p => p.product_id) || []
    ),
    admin.from("store_metrics").select("*").eq("seller_id", sellerId),
    admin.from("alerts").select("*").eq("seller_id", sellerId),
    admin.from("changelog").select("*").eq("seller_id", sellerId),
    admin.from("price_elasticity").select("*").eq("seller_id", sellerId),
    // Connections: убираем зашифрованные секреты
    admin.from("data_connections").select("id,kind,status,last_sync_at,last_error,created_at").eq("seller_id", sellerId),
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
    products: products.data || [],
    inventory_snapshots: snapshots.data || [],
    inventory_events: events.data || [],
    tvelo_metrics: metrics.data || [],
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
