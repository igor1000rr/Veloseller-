import { NextRequest, NextResponse } from "next/server";
import { WAREHOUSE_COOKIE_NAME, WAREHOUSE_COOKIE_MAX_AGE } from "@/lib/warehouse";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth";
import { z } from "zod";
import { parseJsonBody } from "@/lib/validation";

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
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;

  const limited = enforceRateLimit(req, RATE_LIMITS.WRITE, user.id);
  if (limited) return limited;

  const parsed = await parseJsonBody(req, z.object({
    warehouse_id: z.string().min(1, "warehouse_id обязателен"),
  }));
  if (!parsed.ok) return parsed.response;
  const warehouseId = parsed.data.warehouse_id;

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
