import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  buildPaymentUrl,
  checkRobokassaConfig,
  isValidPlan,
  PLAN_PRICES,
} from "@/lib/robokassa";

/**
 * POST /api/robokassa/create-payment — создаёт invoice в БД + URL для оплаты на Robokassa.
 *
 * Body: { plan: "starter" | "growth" | "pro" }
 * Response: { url: string }
 *
 * Frontend делает window.location.href = url — юзер переходит на Robokassa,
 * оплачивает, возвращается по Success/Fail URL.
 * Подписка активируется с Result URL webhook'a (асинхронно от редиректа).
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit(req, RATE_LIMITS.WRITE, user.id);
  if (limited) return limited;

  // Проверяем что Robokassa настроена (ENV variables заданы)
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
  if (!plan || typeof plan !== "string" || !isValidPlan(plan)) {
    return NextResponse.json(
      { error: "Неизвестный тариф. Допустимые значения: starter, growth, pro" },
      { status: 400 },
    );
  }

  const amount = PLAN_PRICES[plan];
  const description = `Veloseller — тариф ${plan.charAt(0).toUpperCase() + plan.slice(1)} (месяц)`;

  // Получаем email селлера для предварительного заполнения на Robokassa
  const { data: seller } = await supabase
    .from("sellers").select("email").eq("id", user.id).maybeSingle();

  // Создаём invoice. inv_id сгенерируется BIGSERIALью базы.
  const { data: invoice, error: insertErr } = await supabase
    .from("robokassa_invoices")
    .insert({
      seller_id: user.id,
      plan,
      amount,
      currency: "RUB",
      status: "pending",
      is_test: process.env.ROBOKASSA_TEST_MODE === "1",
    })
    .select("inv_id")
    .single();

  if (insertErr || !invoice) {
    return NextResponse.json({ error: "Не удалось создать заявку на оплату" }, { status: 500 });
  }

  // Генерируем URL на Robokassa
  let url: string;
  try {
    url = buildPaymentUrl({
      invId: Number(invoice.inv_id),
      amount,
      description,
      email: seller?.email ?? user.email ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Ошибка генерации URL: ${e?.message || "unknown"}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ url, inv_id: invoice.inv_id });
}
