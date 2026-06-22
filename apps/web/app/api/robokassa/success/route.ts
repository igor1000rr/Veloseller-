import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/features";

/**
 * Success URL — куда Robokassa редиректит юзера после успешной оплаты.
 *
 * ВАЖНО: не активируем подписку здесь. Этот endpoint вызывается из браузера —
 * подпись подделываема. Активация только в Result URL (server-to-server, Password2).
 *
 * Редирект строим от SITE_URL, а НЕ от req.url: за nginx-кластером (инстансы на
 * 127.0.0.1:3001-3003) req.url внутренний, и относительный редирект уводил юзера
 * на localhost:3003 (ERR_CONNECTION_REFUSED). 303 → браузер делает GET /billing.
 */
function toBilling() {
  return NextResponse.redirect(new URL("/billing?paid=1", SITE_URL), 303);
}

export async function GET() {
  return toBilling();
}

export async function POST() {
  return toBilling();
}
