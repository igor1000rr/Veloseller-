import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * PATCH /api/products/[id]/reorder
 * Обновляет lead_time_days и safety_days для SKU.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  const { error } = await supabase
    .from("products").update(update).eq("product_id", id).eq("seller_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
