import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/features";

/**
 * Fail URL — куда Robokassa редиректит юзера при отказе от оплаты.
 * Редирект от SITE_URL (за nginx req.url внутренний — см. success/route.ts).
 */
function toBilling() {
  return NextResponse.redirect(new URL("/billing?canceled=1", SITE_URL), 303);
}

export async function GET() {
  return toBilling();
}

export async function POST() {
  return toBilling();
}
