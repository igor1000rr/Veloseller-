import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth";
import type { Enums } from "@/lib/database.types";

// Разрешённые типы alert'ов (синхронизировано с engine/alerts.py)
const ALLOWED_KINDS = new Set([
  "low_stock", "critical_stock", "dead_inventory", "repeated_stockout", "underestimated_sku",
]);

/**
 * POST /api/alerts/bulk-ack
 * Body: { kind?: string }  — если передан тип, ack всех активных этого типа. Без типа — все активные.
 *
 * БАГ 78 fix: не светим error.message в response.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;

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
    query = query.eq("kind", body.kind as Enums<"alert_kind">);
  }

  const { error, count } = await query;
  if (error) {
    console.error("[bulk-ack] DB error:", error.message);
    return NextResponse.json({ error: "Не удалось обновить" }, { status: 500 });
  }
  return NextResponse.json({ acknowledged: count ?? 0 });
}
