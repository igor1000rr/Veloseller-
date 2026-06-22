import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { requireUser, jsonError } from "@/lib/auth";
import {
  buildPaymentUrl,
  checkRobokassaConfig,
  isPayablePlan,
  planPriceOf,
  planLabelOf,
  productKindOfPlan,
} from "@/lib/robokassa";

/**
 * POST /api/robokassa/create-payment — создаёт invoice в БД + URL для оплаты на Robokassa.
 *
 * Body: { plan: "starter" | "growth" | "pro" | "radar_*" | "custom_{wh}x{sku}" }
 * Response: { url: string, inv_id: number }
 *
 * Конструктор (Александр 04.06.2026): plan вида custom_5x2000. Сумма считается
 * ТОЛЬКО на сервере из кодировки (planPriceOf) — клиентская цена не принимается.
 *
 * Frontend делает window.location.href = url — юзер переходит на Robokassa,
 * оплачивает, возвращается по Success/Fail URL.
 * Подписка активируется с Result URL webhook'a (асинхронно от редиректа).
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;

  const limited = enforceRateLimit(req, RATE_LIMITS.WRITE, user.id);
  if (limited) return limited;

  const cfg = checkRobokassaConfig();
  if (!cfg.ok) {
    return NextResponse.json(
      { error: `Платёжная система пока не настроена. Свяжитесь с поддержкой. (${cfg.error})` },
      { status: 503 },
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const plan = body?.plan;
  if (!plan || typeof plan !== "string" || !isPayablePlan(plan)) {
    return NextResponse.json(
      { error: "Неизвестный тариф" },
      { status: 400 },
    );
  }

  const amount = planPriceOf(plan)!;
  const productKind = productKindOfPlan(plan);
  const planLabel = planLabelOf(plan);
  const description = productKind === "radar"
    ? `Veloseller Radar — тариф ${planLabel} (месяц)`
    : `Veloseller — тариф ${planLabel} (месяц)`;

  const { data: seller } = await supabase
    .from("sellers").select("email").eq("id", user.id).maybeSingle();

  const { data: invoice, error: insertErr } = await supabase
    .from("robokassa_invoices")
    .insert({
      seller_id: user.id,
      plan,
      product_kind: productKind,
      amount,
      currency: "RUB",
      status: "pending",
      is_test: process.env.ROBOKASSA_TEST_MODE === "1",
    })
    .select("inv_id")
    .single();

  if (insertErr || !invoice) {
    // Логируем причину БД-ошибки (раньше глоталось → 500 без следов в логах).
    console.error("[robokassa-create] invoice insert failed:", insertErr?.message, { plan });
    return NextResponse.json({ error: "Не удалось создать заявку на оплату" }, { status: 500 });
  }

  let url: string;
  try {
    url = buildPaymentUrl({
      invId: Number(invoice.inv_id),
      amount,
      description,
      email: seller?.email ?? user.email ?? null,
    });
  } catch (e: any) {
    // Деталь генерации (подпись/конфиг) — только в логи, наружу общий текст.
    return jsonError(500, "Не удалось сформировать ссылку на оплату", e);
  }

  return NextResponse.json({ url, inv_id: invoice.inv_id });
}
