/**
 * Success URL — резервная активация подписки при возврате из браузера.
 *
 * Authoritative-подтверждение оплаты — Result URL (Password2). Но если он не настроен
 * в кабинете Robokassa / не доходит, Success URL активирует тариф по подписи Password1.
 *
 * Проверяем:
 * - Валидная подпись Password1 → activatePaidInvoice вызван + редирект /billing?paid=1
 * - Поддельная подпись        → activatePaidInvoice НЕ вызван (но редирект всё равно)
 * - Без параметров            → activatePaidInvoice НЕ вызван (прямой заход на /success)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";

const ORIG_ENV = { ...process.env };

const activateMock = vi.fn();
vi.mock("@/lib/robokassa-activate", () => ({
  activatePaidInvoice: (...args: unknown[]) => activateMock(...args),
}));

beforeEach(() => {
  process.env.ROBOKASSA_MERCHANT_LOGIN = "veloseller_test";
  process.env.ROBOKASSA_PASSWORD_1 = "secret1";
  process.env.ROBOKASSA_PASSWORD_2 = "secret2";
  delete process.env.ROBOKASSA_TEST_MODE;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  activateMock.mockReset();
  activateMock.mockResolvedValue({ ok: true, alreadyPaid: false });
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIG_ENV };
});

function successSig(outSum: string, invId: string, password1 = "secret1"): string {
  return createHash("md5").update(`${outSum}:${invId}:${password1}`, "utf8").digest("hex");
}

describe("GET /api/robokassa/success", () => {
  it("валидная подпись Password1 → активирует и редиректит на /billing?paid=1", async () => {
    const sig = successSig("2500.00", "42");
    const { GET } = await import("@/app/api/robokassa/success/route");
    const url = `http://127.0.0.1:3003/api/robokassa/success?OutSum=2500.00&InvId=42&SignatureValue=${sig}`;
    const res = await GET(new Request(url) as any);

    expect(res.status).toBe(303);
    // редирект строится от SITE_URL, а не от внутреннего req.url (nginx-кластер)
    expect(res.headers.get("location")).toBe("https://veloseller.ru/billing?paid=1");
    expect(activateMock).toHaveBeenCalledTimes(1);
    expect(activateMock).toHaveBeenCalledWith(
      expect.objectContaining({ invId: "42", outSum: "2500.00", source: "success" }),
    );
  });

  it("поддельная подпись → НЕ активирует, но редирект всё равно отдаёт", async () => {
    const { GET } = await import("@/app/api/robokassa/success/route");
    const url = "http://127.0.0.1:3003/api/robokassa/success?OutSum=2500.00&InvId=42&SignatureValue=deadbeef00112233445566778899aabb";
    const res = await GET(new Request(url) as any);

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://veloseller.ru/billing?paid=1");
    expect(activateMock).not.toHaveBeenCalled();
  });

  it("без параметров (прямой заход) → не активирует", async () => {
    const { GET } = await import("@/app/api/robokassa/success/route");
    const res = await GET(new Request("http://127.0.0.1:3003/api/robokassa/success") as any);

    expect(res.status).toBe(303);
    expect(activateMock).not.toHaveBeenCalled();
  });
});
