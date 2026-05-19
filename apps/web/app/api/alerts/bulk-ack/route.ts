import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

// Разрешённые типы alert'ов (синхронизировано с engine/alerts.py)
const ALLOWED_KINDS = new Set([
  "low_stock", "critical_stock", "dead_inventory", "repeated_stockout", "underestimated_sku",
]);

/**
 * POST /api/alerts/bulk-ack
 * Body: { kind?: string }  — если передан тип, ack всех активных этого типа. Без типа — все активные.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit(req, RATE_LIMITS.WRITE, user.id);
  if (limited) return limited;

  let body: { kind?: string } = {};
  try { body = await req.json(); } catch { /* allow empty */ }

  // Валидация kind
  if (body.kind && !ALLOWED_KINDS.has(body.kind)) {
    return NextResponse.json({ error: `Недопустимый kind` }, { status: 400 });
  }

  let query = supabase
    .from("alerts")
    .update({ acknowledged_at: new Date().toISOString() }, { count: "exact" })
    .eq("seller_id", user.id)
    .is("acknowledged_at", null);

  if (body.kind) {
    query = query.eq("kind", body.kind);
  }

  const { error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ acknowledged: count ?? 0 });
}
