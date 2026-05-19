import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET  /api/connections/[id]  — детали подключения (с расшифрованным флагом, но без секретов)
 * DELETE /api/connections/[id] — удалить подключение (RLS гарантирует, что только свои)
 *
 * Inventory snapshots ссылаются на connection_id с ON DELETE SET NULL —
 * данные продуктов остаются, а вот связь со снапшотами обрывается.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("data_connections")
    .select("id, name, source, marketplace, status, last_sync_at, last_error, created_at, updated_at, config")
    .eq("id", id)
    .eq("seller_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data)  return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Скрываем секреты в config, оставляем только non-sensitive
  const safeConfig: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data.config ?? {})) {
    if (["client_id", "api_key", "token", "_encrypted"].includes(k)) {
      safeConfig[k] = typeof v === "string" && v.length > 0 ? "••••" : v;
    } else {
      safeConfig[k] = v;
    }
  }

  return NextResponse.json({ ...data, config: safeConfig });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error, count } = await supabase
    .from("data_connections")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("seller_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
