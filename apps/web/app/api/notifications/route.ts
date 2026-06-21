import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth";

/**
 * POST /api/notifications — обновляет seller profile.
 *
 * БАГ 42-43 fix: rate limit + строгая валидация типов полей.
 * БАГ 78 fix: не светим Supabase error.message наружу — может содержать SQL detail.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;

  const limited = enforceRateLimit(req, RATE_LIMITS.WRITE, user.id);
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = {};

  // display_name: string ≤200
  if ("display_name" in body) {
    const v = body.display_name;
    if (v === null) update.display_name = null;
    else if (typeof v === "string" && v.length <= 200) update.display_name = v;
    else return NextResponse.json({ error: "display_name: строка ≤200 символов или null" }, { status: 400 });
  }
  // timezone: string ≤64, разрешаем IANA-like (буквы/_-/)
  if ("timezone" in body) {
    const v = body.timezone;
    if (typeof v === "string" && v.length <= 64 && /^[A-Za-z_/+\-0-9]+$/.test(v)) {
      update.timezone = v;
    } else {
      return NextResponse.json({ error: "timezone должен быть валидным IANA timezone" }, { status: 400 });
    }
  }
  // telegram_chat_id: string или null (можно отвязать)
  if ("telegram_chat_id" in body) {
    const v = body.telegram_chat_id;
    if (v === null) update.telegram_chat_id = null;
    else if (typeof v === "string" && v.length <= 64) update.telegram_chat_id = v;
    else if (typeof v === "number") update.telegram_chat_id = String(v);
    else return NextResponse.json({ error: "telegram_chat_id: строка/число/null" }, { status: 400 });
  }
  // notify_email, notify_telegram: boolean
  for (const k of ["notify_email", "notify_telegram"] as const) {
    if (k in body) {
      if (typeof body[k] !== "boolean") {
        return NextResponse.json({ error: `${k} должен быть boolean` }, { status: 400 });
      }
      update[k] = body[k];
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Нет полей для обновления" }, { status: 400 });
  }

  const { error } = await supabase.from("sellers").update(update).eq("id", user.id);
  if (error) {
    // БАГ 78: detail в console, наружу — generic
    console.error("[notifications] DB update failed:", error.message);
    return NextResponse.json({ error: "Не удалось сохранить настройки" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
