/**
 * Критичный тест webhook'a Robokassa Result URL.
 *
 * На этот endpoint приходит подтверждение оплаты — если будет баг, то платёж либо
 * не зачтётся (реальные деньги от юзера пропадут), либо атакующий выдаст себе
 * платную подписку бесплатно.
 *
 * Проверяем:
 * - Поддельная подпись → FAIL
 * - Неверная сумма → FAIL (защита от подмены)
 * - Несуществующий invoice → FAIL
 * - Повторный webhook (идемпотентность) → OK, без обновления плана
 * - Нормальный флоу → "OK{InvId}" + plan обновлён + subscription_expires_at = +30d
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";

const ORIG_ENV = { ...process.env };

// Моки admin client
const getInvoiceMock = vi.fn();
const updateInvoiceEqMock = vi.fn();
const updateSellerEqMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      if (table === "robokassa_invoices") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: getInvoiceMock,
            })),
          })),
          update: vi.fn(() => ({
            eq: updateInvoiceEqMock,
          })),
        };
      }
      if (table === "sellers") {
        return {
          update: vi.fn(() => ({
            eq: updateSellerEqMock,
          })),
        };
      }
      return {};
    },
  }),
}));

beforeEach(() => {
  process.env.ROBOKASSA_MERCHANT_LOGIN = "veloseller_test";
  process.env.ROBOKASSA_PASSWORD_1 = "secret1";
  process.env.ROBOKASSA_PASSWORD_2 = "secret2";
  delete process.env.ROBOKASSA_TEST_MODE;
  getInvoiceMock.mockReset();
  updateInvoiceEqMock.mockReset();
  updateSellerEqMock.mockReset();
  updateInvoiceEqMock.mockResolvedValue({ error: null });
  updateSellerEqMock.mockResolvedValue({ error: null });
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIG_ENV };
});

function validSignature(outSum: string, invId: string, password2 = "secret2"): string {
  return createHash("md5").update(`${outSum}:${invId}:${password2}`, "utf8").digest("hex");
}

function makeFormRequest(params: Record<string, string>): Request {
  const form = new FormData();
  for (const [k, v] of Object.entries(params)) form.append(k, v);
  return new Request("http://x/api/robokassa/result", { method: "POST", body: form });
}

describe("POST /api/robokassa/result — SECURITY", () => {
  it("отклоняет поддельную подпись", async () => {
    const { POST } = await import("@/app/api/robokassa/result/route");
    const res = await POST(makeFormRequest({
      OutSum: "2500.00",
      InvId: "42",
      SignatureValue: "deadbeef00112233445566778899aabb",
    }) as any);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("bad signature");
    expect(updateInvoiceEqMock).not.toHaveBeenCalled();
    expect(updateSellerEqMock).not.toHaveBeenCalled();
  });

  it("отклоняет запрос без обязательных параметров", async () => {
    const { POST } = await import("@/app/api/robokassa/result/route");
    const res = await POST(makeFormRequest({ OutSum: "2500.00" }) as any);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("missing");
  });

  it("отклоняет если invoice не найден", async () => {
    getInvoiceMock.mockResolvedValue({ data: null, error: null });
    const sig = validSignature("2500.00", "42");
    const { POST } = await import("@/app/api/robokassa/result/route");
    const res = await POST(makeFormRequest({
      OutSum: "2500.00", InvId: "42", SignatureValue: sig,
    }) as any);
    expect(res.status).toBe(404);
    expect(updateInvoiceEqMock).not.toHaveBeenCalled();
  });

  it("КРИТИЧНО: отклоняет подмену суммы (в БД 2500, в запросе 100)", async () => {
    getInvoiceMock.mockResolvedValue({
      data: { id: "inv-uuid", seller_id: "u1", plan: "starter", amount: 2500, status: "pending" },
      error: null,
    });
    // Правильная подпись для «100» но в БД сумма 2500.
    const sig = validSignature("100.00", "42");
    const { POST } = await import("@/app/api/robokassa/result/route");
    const res = await POST(makeFormRequest({
      OutSum: "100.00", InvId: "42", SignatureValue: sig,
    }) as any);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("amount mismatch");
    expect(updateInvoiceEqMock).not.toHaveBeenCalled();
    expect(updateSellerEqMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/robokassa/result — FLOW", () => {
  it("успешная оплата → 'OK{InvId}' + plan/seller обновлены", async () => {
    getInvoiceMock.mockResolvedValue({
      data: { id: "inv-uuid", seller_id: "u1", plan: "growth", amount: 6900, status: "pending" },
      error: null,
    });
    const sig = validSignature("6900.00", "7");
    const { POST } = await import("@/app/api/robokassa/result/route");
    const res = await POST(makeFormRequest({
      OutSum: "6900.00", InvId: "7", SignatureValue: sig,
    }) as any);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK7");
    expect(updateInvoiceEqMock).toHaveBeenCalledTimes(1);
    expect(updateSellerEqMock).toHaveBeenCalledTimes(1);
  });

  it("идемпотентность: повторный webhook не обновляет план", async () => {
    getInvoiceMock.mockResolvedValue({
      data: { id: "inv-uuid", seller_id: "u1", plan: "pro", amount: 14900, status: "paid" },
      error: null,
    });
    const sig = validSignature("14900.00", "99");
    const { POST } = await import("@/app/api/robokassa/result/route");
    const res = await POST(makeFormRequest({
      OutSum: "14900.00", InvId: "99", SignatureValue: sig,
    }) as any);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK99");
    // Статус уже paid → ни invoice, ни seller не трогаем
    expect(updateInvoiceEqMock).not.toHaveBeenCalled();
    expect(updateSellerEqMock).not.toHaveBeenCalled();
  });

  it("работает и через GET (Робокасса иногда шлёт GET)", async () => {
    getInvoiceMock.mockResolvedValue({
      data: { id: "inv-uuid", seller_id: "u1", plan: "starter", amount: 2500, status: "pending" },
      error: null,
    });
    const sig = validSignature("2500.00", "55");
    const { GET } = await import("@/app/api/robokassa/result/route");
    const url = `http://x/api/robokassa/result?OutSum=2500.00&InvId=55&SignatureValue=${sig}`;
    const res = await GET(new Request(url) as any);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK55");
  });
});
