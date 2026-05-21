import { NextRequest, NextResponse } from "next/server";

/**
 * Fail URL — куда Robokassa редиректит юзера при отказе от оплаты.
 */
export async function GET(req: NextRequest) {
  return NextResponse.redirect(new URL("/billing?canceled=1", req.url));
}

export async function POST(req: NextRequest) {
  return NextResponse.redirect(new URL("/billing?canceled=1", req.url));
}
