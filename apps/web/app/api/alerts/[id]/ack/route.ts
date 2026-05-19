import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * POST /api/alerts/[id]/ack — отметить уведомление как прочитанное.
 * RLS гарантирует что юзер может изменить только свои.
 *
 * БАГ 44 fix: возвращаем 404 если alert не найден (раньше всегда ok:true).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit(req, RATE_LIMITS.WRITE, user.id);
  if (limited) return limited;

  const { error, count } = await supabase
    .from("alerts")
    .update({ acknowledged_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", id)
    .eq("seller_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
