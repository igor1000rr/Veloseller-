import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * PATCH /api/products/[id]/reorder
 * Обновляет lead_time_days и safety_days для SKU.
 *
 * БАГ 45 fix: rate limit + empty update check.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit(req, RATE_LIMITS.WRITE, user.id);
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const update: Record<string, number | null> = {};
  for (const k of ["lead_time_days", "safety_days"] as const) {
    if (k in body) {
      const v = body[k];
      if (v === null || v === "") update[k] = null;
      else {
        const n = parseInt(String(v), 10);
        if (!isNaN(n) && n >= 0 && n <= 365) update[k] = n;
      }
    }
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Нет валидных полей для обновления" }, { status: 400 });
  }

  const { error, count } = await supabase
    .from("products")
    .update(update, { count: "exact" })
    .eq("product_id", id)
    .eq("seller_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
