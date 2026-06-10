import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { timingSafeEqual } from "node:crypto";

/**
 * Привязка Telegram для этого инстанса (server-to-server).
 *
 * Единый бот живёт на EU; его вебхук принимает /start. Когда /start приходит с
 * токеном, помеченным как этот инстанс (метка 'r'), EU-воркер не лезет в нашу
 * базу напрямую (изоляция данных), а дёргает этот эндпоинт с общим секретом
 * RU_BIND_SECRET — и уже мы пишем telegram_chat_id в СВОЮ базу.
 *
 * Контракт (ожидается EU-воркером app.main._bind_telegram_remote_ru):
 *   POST { seller_id, chat_id }, заголовок X-Bind-Secret
 *   200 {ok:true} — привязали; иначе ok:false (403/400/404/500).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.RU_BIND_SECRET;
  if (!expected) {
    return NextResponse.json({ ok: false, error: "not configured" }, { status: 500 });
  }
  const provided = req.headers.get("x-bind-secret") || "";
  if (!provided || !safeEqual(provided, expected)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: { seller_id?: string; chat_id?: string | number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const sellerId = (body.seller_id || "").toString().trim();
  const chatId = (body.chat_id ?? "").toString().trim();
  if (!UUID_RE.test(sellerId) || !chatId) {
    return NextResponse.json({ ok: false, error: "seller_id and chat_id required" }, { status: 400 });
  }

  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from("sellers")
    .update({ telegram_chat_id: chatId, notify_telegram: true })
    .eq("id", sellerId)
    .select("id");

  if (error) {
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "seller not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
