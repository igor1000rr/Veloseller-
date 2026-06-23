import { NextRequest, NextResponse } from "next/server";
import { requireRadarAccess } from "../../_helpers";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/radar/brands/[id]
 * Изменить статус бренда (approved ↔ excluded).
 *
 * При переключении из excluded → approved проверяем лимит тарифа.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRadarAccess();
  if (auth instanceof NextResponse) return auth;
  const { sb, userId, brandsLimit } = auth;

  const limited = enforceRateLimit(req, RATE_LIMITS.WRITE, userId);
  if (limited) return limited;

  const { id } = await params;

  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.status || !['approved', 'excluded'].includes(body.status)) {
    return NextResponse.json({
      error: "Поле status обязательно: approved или excluded"
    }, { status: 400 });
  }

  // RLS гарантирует что юзер не сможет тронуть чужой бренд
  // (seller_id = auth.uid()), но дополнительная проверка не помешает.
  const { data: existing, error: fetchErr } = await sb
    .from("radar_brands")
    .select("id,status,seller_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !existing || existing.seller_id !== userId) {
    return NextResponse.json({ error: "Бренд не найден" }, { status: 404 });
  }

  // Если переключаем excluded → approved, проверяем лимит
  if (existing.status === "excluded" && body.status === "approved") {
    const { count } = await sb
      .from("radar_brands")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", userId)
      .eq("status", "approved");

    if ((count ?? 0) >= brandsLimit) {
      return NextResponse.json({
        error: `Лимит тарифа: ${brandsLimit} брендов. Исключите другой бренд или обновите тариф.`,
        code: "RADAR_BRANDS_LIMIT",
      }, { status: 403 });
    }
  }

  // belt-and-suspenders: помимо RLS явно ограничиваем запись своим seller_id
  // (как в роутах connections).
  const { error } = await sb
    .from("radar_brands")
    .update({ status: body.status })
    .eq("id", id)
    .eq("seller_id", userId);

  if (error) {
    console.error("[radar-brand-update] DB error:", error.message);
    return NextResponse.json({ error: "Не удалось обновить бренд" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/radar/brands/[id]
 * Удалить бренд и все его запросы (CASCADE).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRadarAccess();
  if (auth instanceof NextResponse) return auth;
  const { sb, userId } = auth;

  const limited = enforceRateLimit(req, RATE_LIMITS.WRITE, userId);
  if (limited) return limited;

  const { id } = await params;

  // RLS отфильтрует если не свой
  const { error } = await sb
    .from("radar_brands")
    .delete()
    .eq("id", id)
    .eq("seller_id", userId);

  if (error) {
    console.error("[radar-brand-delete] DB error:", error.message);
    return NextResponse.json({ error: "Не удалось удалить бренд" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
