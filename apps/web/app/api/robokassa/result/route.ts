import { NextRequest } from "next/server";
import { verifyResultSignature } from "@/lib/robokassa";
import { activatePaidInvoice } from "@/lib/robokassa-activate";
import { enforceRateLimitDurable, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Result URL для Robokassa — server-to-server webhook о успешной оплате
 * (authoritative-источник подтверждения).
 *
 *  1. Проверяем подпись через Password2.
 *  2. Проверяем совпадение test/prod-режима сервера с флагом IsTest.
 *  3. Активируем подписку (см. activatePaidInvoice — общая идемпотентная логика,
 *     ей же пользуется Success URL как резерв).
 *  4. Отвечаем ровно "OK{InvId}" plain text — иначе Robokassa будет ретраить.
 */
async function handle(req: NextRequest): Promise<Response> {
  const limited = await enforceRateLimitDurable(req, RATE_LIMITS.WEBHOOK);
  if (limited) return new Response("FAIL: rate limit", { status: 429 });

  let outSum: string | null = null;
  let invId: string | null = null;
  let signatureValue: string | null = null;
  let isTest = false;

  if (req.method === "POST") {
    const form = await req.formData().catch(() => null);
    if (form) {
      outSum = form.get("OutSum")?.toString() || null;
      invId = form.get("InvId")?.toString() || null;
      signatureValue = form.get("SignatureValue")?.toString() || null;
      isTest = form.get("IsTest")?.toString() === "1";
    }
  } else {
    const { searchParams } = new URL(req.url);
    outSum = searchParams.get("OutSum");
    invId = searchParams.get("InvId");
    signatureValue = searchParams.get("SignatureValue");
    isTest = searchParams.get("IsTest") === "1";
  }

  if (!outSum || !invId || !signatureValue) {
    console.warn("[robokassa-result] missing params", { hasOutSum: !!outSum, hasInvId: !!invId, hasSig: !!signatureValue });
    return new Response("FAIL: missing params", { status: 400 });
  }

  const serverIsTest = process.env.ROBOKASSA_TEST_MODE === "1";
  if (isTest !== serverIsTest) {
    console.warn("[robokassa-result] test/prod mode mismatch", {
      serverIsTest, callbackIsTest: isTest, invId,
    });
    return new Response("FAIL: test/prod mode mismatch", { status: 400 });
  }

  if (!verifyResultSignature({ outSum, invId, signatureValue })) {
    console.warn("[robokassa-result] bad signature", { invId, isTest, serverIsTest });
    return new Response("FAIL: bad signature", { status: 400 });
  }

  const outcome = await activatePaidInvoice({ invId, outSum, isTest, source: "result", signatureValue });
  if (!outcome.ok) {
    return new Response(`FAIL: ${outcome.reason}`, { status: outcome.httpStatus });
  }

  return new Response(`OK${invId}`, {
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}
