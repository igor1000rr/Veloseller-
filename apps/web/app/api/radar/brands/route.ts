import { NextRequest, NextResponse } from "next/server";
import { requireRadarAccess, normalizeBrandName } from "../_helpers";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/radar/brands
 * Добавить бренд вручную. Лимит зависит от тарифа.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRadarAccess();
  if (auth instanceof NextResponse) return auth;
  const { sb, userId, brandsLimit } = auth;

  // Rate-limit чтобы не загадили БД ботом
  const limited = enforceRateLimit(req, RATE_LIMITS.WRITE, userId);
  if (limited) return limited;

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawName = body.name?.trim();
  if (!rawName) {
    return NextResponse.json({ error: "Поле name обязательно" }, { status: 400 });
  }
  if (rawName.length < 2 || rawName.length > 60) {
    return NextResponse.json({ error: "Длина бренда 2-60 символов" }, { status: 400 });
  }

  const normalized = normalizeBrandName(rawName);

  // Проверка лимита подписки. Считаем только approved — excluded не учитываются.
  const { count } = await sb
    .from("radar_brands")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", userId)
    .eq("status", "approved");

  if ((count ?? 0) >= brandsLimit) {
    return NextResponse.json({
      error: `Лимит тарифа: ${brandsLimit} брендов. Исключите ненужные или обновите тариф.`,
      code: "RADAR_BRANDS_LIMIT",
    }, { status: 403 });
  }

  // Upsert: если бренд был раньше excluded — возвращаем его в approved
  const { data, error } = await sb
    .from("radar_brands")
    .upsert(
      {
        seller_id: userId,
        name: rawName,
        name_normalized: normalized,
        source: "manual",
        status: "approved",
      },
      { onConflict: "seller_id,name_normalized" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ brand: data });
}
