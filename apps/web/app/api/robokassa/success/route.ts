import { NextRequest, NextResponse } from "next/server";

/**
 * Success URL — куда Robokassa редиректит юзера после успешной оплаты.
 *
 * ВАЖНО: не активируем подписку здесь. Этот endpoint вызывается из браузера юзера —
 * подпись можно подделать (Robokassa отправляет её в query params).
 * Активация идёт только в Result URL (server-to-server, подпись защищена Password2).
 *
 * Здесь просто редирект на /billing?paid=1 с информативным баннером.
 */
export async function GET(req: NextRequest) {
  return NextResponse.redirect(new URL("/billing?paid=1", req.url));
}

export async function POST(req: NextRequest) {
  return NextResponse.redirect(new URL("/billing?paid=1", req.url));
}
