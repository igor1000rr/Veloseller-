import { NextRequest, NextResponse } from "next/server";
import { requireRadarAccess } from "../../../_helpers";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const VALID_ACTIONS = ["favorite", "unwatch", "archive", "unarchive", "watch"] as const;
type Action = typeof VALID_ACTIONS[number];

/**
 * POST /api/radar/queries/[id]/action
 * Действия пользователя над запросом:
 *  - favorite   → is_favorite = true (звезда зажглась)
 *  - unwatch    → is_favorite = false (звезда снята)
 *  - watch      → status = 'watching' + is_favorite = true
 *  - archive    → status = 'archived'
 *  - unarchive  → возврат в новый/ранний по наличию подтверждений
 *
 * Каждое действие пишется в radar_actions для будущей аналитики UX и ML.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRadarAccess();
  if (auth instanceof NextResponse) return auth;
  const { sb, userId } = auth;

  const limited = enforceRateLimit(req, RATE_LIMITS.WRITE, userId);
  if (limited) return limited;

  const { id } = await params;

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action as Action;
  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json({
      error: `action должно быть одним из: ${VALID_ACTIONS.join(", ")}`,
    }, { status: 400 });
  }

  // Получаем запрос для определения текущего состояния
  const { data: query, error: fetchErr } = await sb
    .from("radar_queries")
    .select("id,status,is_favorite,present_in_wb,present_in_ozon,seller_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !query || query.seller_id !== userId) {
    return NextResponse.json({ error: "Запрос не найден" }, { status: 404 });
  }

  let updateFields: any = {};

  switch (action) {
    case "favorite":
      updateFields = { is_favorite: true };
      break;
    case "unwatch":
      // Если из watching tab — переводим обратно в new/early
      updateFields = { is_favorite: false };
      if (query.status === "watching") {
        updateFields.status = (query.present_in_wb || query.present_in_ozon) ? "new" : "early";
      }
      break;
    case "watch":
      updateFields = { status: "watching", is_favorite: true };
      break;
    case "archive":
      updateFields = { status: "archived" };
      break;
    case "unarchive":
      // Восстанавливаем по наличию подтверждений: если есть suggest — new, иначе early
      updateFields = {
        status: (query.present_in_wb || query.present_in_ozon) ? "new" : "early"
      };
      break;
  }

  // belt-and-suspenders: помимо RLS явно ограничиваем запись своим seller_id
  // (как в роутах connections).
  const { error: updateErr } = await sb
    .from("radar_queries")
    .update(updateFields)
    .eq("id", id)
    .eq("seller_id", userId);

  if (updateErr) {
    console.error("[radar-query-action] DB error:", updateErr.message);
    return NextResponse.json({ error: "Не удалось обновить запрос" }, { status: 500 });
  }

  // Запись в лог действий — не критичная операция, не валим запрос если упадёт
  try {
    await sb.from("radar_actions").insert({
      seller_id: userId,
      query_id: id,
      action_type: action,
    });
  } catch (e) {
    console.error("radar_actions write failed", e);
  }

  return NextResponse.json({ success: true });
}
