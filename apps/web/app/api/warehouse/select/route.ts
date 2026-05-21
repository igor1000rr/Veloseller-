import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { WAREHOUSE_COOKIE_NAME, WAREHOUSE_COOKIE_MAX_AGE } from "@/lib/warehouse";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * POST /api/warehouse/select — установить выбранный склад в cookie vs-warehouse.
 *
 * Body: { warehouse_id: string }
 *
 * Безопасность:
 * - 401 если не авторизован
 * - 403 если warehouse_id не принадлежит этому пользователю
 * - cookie httpOnly + sameSite=lax
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit(req, RATE_LIMITS.WRITE, user.id);
  if (limited) return limited;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const warehouseId = body?.warehouse_id;
  if (!warehouseId || typeof warehouseId !== "string") {
    return NextResponse.json({ error: "warehouse_id обязателен" }, { status: 400 });
  }

  // Проверяем что склад принадлежит пользователю (защита от подмены)
  const { data: connection, error } = await supabase
    .from("data_connections")
    .select("id")
    .eq("id", warehouseId)
    .eq("seller_id", user.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
  if (!connection) {
    return NextResponse.json({ error: "Склад не найден" }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true, warehouse_id: warehouseId });
  response.cookies.set(WAREHOUSE_COOKIE_NAME, warehouseId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: WAREHOUSE_COOKIE_MAX_AGE,
    path: "/",
  });
  return response;
}
