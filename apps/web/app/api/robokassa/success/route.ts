import { NextRequest, NextResponse } from "next/server";
import { SITE_URL } from "@/lib/features";
import { verifySuccessSignature } from "@/lib/robokassa";
import { activatePaidInvoice } from "@/lib/robokassa-activate";

/**
 * Success URL — браузерный возврат покупателя после оплаты.
 *
 * РЕЗЕРВНАЯ активация. Authoritative-подтверждение — Result URL (Password2,
 * server-to-server). Но если Result URL не настроен в кабинете Robokassa или не
 * доходит, деньги списались бы, а тариф не выдавался. Поэтому здесь тоже активируем —
 * по подписи Password1 (MD5(OutSum:InvId:Password1)). Password1 — серверный секрет,
 * подделать редирект нельзя. Активация идемпотентна: если Result URL уже отработал,
 * тут будет no-op (invoice.status='paid').
 *
 * Редирект строим от SITE_URL, а НЕ от req.url: за nginx-кластером (инстансы на
 * 127.0.0.1:3001-3003) req.url внутренний, и относительный редирект уводил юзера
 * на localhost:3003 (ERR_CONNECTION_REFUSED). 303 → браузер делает GET /billing.
 */
async function handle(req: NextRequest): Promise<Response> {
  let outSum: string | null = null;
  let invId: string | null = null;
  let signatureValue: string | null = null;

  if (req.method === "POST") {
    const form = await req.formData().catch(() => null);
    if (form) {
      outSum = form.get("OutSum")?.toString() || null;
      invId = form.get("InvId")?.toString() || null;
      signatureValue = form.get("SignatureValue")?.toString() || null;
    }
  } else {
    const { searchParams } = new URL(req.url);
    outSum = searchParams.get("OutSum");
    invId = searchParams.get("InvId");
    signatureValue = searchParams.get("SignatureValue");
  }

  if (outSum && invId && signatureValue) {
    if (verifySuccessSignature({ outSum, invId, signatureValue })) {
      // Подпись валидна → активируем (идемпотентно). Ошибки только логируем —
      // UX возврата не ломаем, Result URL/повтор довыдадут при необходимости.
      const outcome = await activatePaidInvoice({
        invId,
        outSum,
        isTest: process.env.ROBOKASSA_TEST_MODE === "1",
        source: "success",
        signatureValue,
      });
      if (!outcome.ok) {
        console.warn("[robokassa-success] activation not applied on return", {
          invId, reason: outcome.reason,
        });
      }
    } else {
      console.warn("[robokassa-success] invalid signature on return", { invId });
    }
  }

  // UX неизменен: вернулись из оплаты → показываем «Оплата прошла успешно».
  // Карточка тарифа на /billing рендерится из БД и покажет фактическое состояние.
  return NextResponse.redirect(new URL("/billing?paid=1", SITE_URL), 303);
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
