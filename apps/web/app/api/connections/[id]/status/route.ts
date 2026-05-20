import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/connections/[id]/status
 *
 * Лёгкий endpoint для polling'а статуса sync. Возвращает только то что нужно:
 * status, last_sync_at, last_error. БАГ 87 fix.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: conn } = await supabase
    .from("data_connections")
    .select("id, status, last_sync_at, last_error")
    .eq("id", id)
    .eq("seller_id", user.id)
    .maybeSingle();

  if (!conn) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(conn);
}
