/**
 * Тест endpoint'a /api/robokassa/create-payment.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { _resetRateLimits } from "@/lib/rate-limit";

const ORIG_ENV = { ...process.env };

const getUserMock = vi.fn();
const getSellerMock = vi.fn();
const insertInvoiceSelectSingleMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    from: (table: string) => {
      if (table === "sellers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: getSellerMock,
            })),
          })),
        };
      }
      if (table === "robokassa_invoices") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: insertInvoiceSelectSingleMock,
            })),
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
  getUserMock.mockReset();
  getSellerMock.mockReset();
  insertInvoiceSelectSingleMock.mockReset();
  _resetRateLimits();
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIG_ENV };
});

describe("POST /api/robokassa/create-payment", () => {
  it("без авторизации → 401", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { POST } = await import("@/app/api/robokassa/create-payment/route");
    const res = await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ plan: "starter" }),
    }) as any);
    expect(res.status).toBe(401);
  });

  it("без ключей Robokassa → 503", async () => {
    delete process.env.ROBOKASSA_MERCHANT_LOGIN;
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "u@x.ru" } } });
    const { POST } = await import("@/app/api/robokassa/create-payment/route");
    const res = await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ plan: "starter" }),
    }) as any);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/Платёжная система/);
  });

  it("невалидный plan → 400", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "u@x.ru" } } });
    const { POST } = await import("@/app/api/robokassa/create-payment/route");
    const res = await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ plan: "trial" }),
    }) as any);
    expect(res.status).toBe(400);
  });

  it("невалидный конструктор (вне диапазона) → 400", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "u@x.ru" } } });
    const { POST } = await import("@/app/api/robokassa/create-payment/route");
    const res = await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ plan: "custom_0x999" }),
    }) as any);
    expect(res.status).toBe(400);
  });

  it("успех: возвращает url + inv_id", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "u@x.ru" } } });
    getSellerMock.mockResolvedValue({ data: { email: "u@x.ru" }, error: null });
    insertInvoiceSelectSingleMock.mockResolvedValue({
      data: { inv_id: 123 },
      error: null,
    });
    const { POST } = await import("@/app/api/robokassa/create-payment/route");
    const res = await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ plan: "growth" }),
    }) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toMatch(/^https:\/\/auth\.robokassa\.ru/);
    expect(body.inv_id).toBe(123);
    expect(body.url).toContain("InvId=123");
    expect(body.url).toContain("OutSum=6900.00");
  });

  it("конструктор custom_5x2000: сумма считается на сервере → OutSum=6000.00", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "u@x.ru" } } });
    getSellerMock.mockResolvedValue({ data: { email: "u@x.ru" }, error: null });
    insertInvoiceSelectSingleMock.mockResolvedValue({
      data: { inv_id: 321 },
      error: null,
    });
    const { POST } = await import("@/app/api/robokassa/create-payment/route");
    const res = await POST(new Request("http://x", {
      method: "POST",
      // 5×1000 + (2000/1000)×500 = 6000
      body: JSON.stringify({ plan: "custom_5x2000" }),
    }) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toContain("InvId=321");
    expect(body.url).toContain("OutSum=6000.00");
  });
});
