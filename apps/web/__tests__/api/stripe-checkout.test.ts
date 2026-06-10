import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// БАГ 29: тесты обновлены под новое поведение — origin теперь whitelist
// из APP_URL env, а не user-controlled header. Дефолт APP_URL = https://veloseller.ru
process.env.APP_URL = "https://veloseller.ru,https://app.veloseller.com";

const getUserMock = vi.fn();
const selectChainMock = vi.fn();
const updateChainMock = vi.fn();
const stripeCustomersCreate = vi.fn();
const stripeCheckoutCreate = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ single: selectChainMock })) })),
      update: vi.fn(() => ({ eq: updateChainMock })),
    })),
  }),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    customers: { create: stripeCustomersCreate },
    checkout: { sessions: { create: stripeCheckoutCreate } },
  }),
  STRIPE_PRICES: { starter: "price_starter", growth: "price_growth", pro: "price_pro" },
}));

beforeEach(() => {
  getUserMock.mockReset();
  selectChainMock.mockReset();
  updateChainMock.mockReset();
  stripeCustomersCreate.mockReset();
  stripeCheckoutCreate.mockReset();
});

function req(body: any, origin = "https://app.veloseller.com") {
  return new NextRequest("http://x", { method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body) });
}

describe("POST /api/stripe/checkout", () => {
  it("без авторизации — 401", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { POST } = await import("@/app/api/stripe/checkout/route");
    const res = await POST(req({ plan: "growth" }));
    expect(res.status).toBe(401);
  });

  it("неизвестный план — 400", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    const { POST } = await import("@/app/api/stripe/checkout/route");
    const res = await POST(req({ plan: "unknown" }));
    expect(res.status).toBe(400);
  });

  it("если customer уже есть — создаёт checkout с ним", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    selectChainMock.mockResolvedValue({ data: { stripe_customer_id: "cus_existing", email: "a@b.com" } });
    stripeCheckoutCreate.mockResolvedValue({ url: "https://checkout/123" });
    const { POST } = await import("@/app/api/stripe/checkout/route");
    await POST(req({ plan: "growth" }));
    expect(stripeCustomersCreate).not.toHaveBeenCalled();
    expect(stripeCheckoutCreate).toHaveBeenCalledWith(expect.objectContaining({
      customer: "cus_existing", line_items: [{ price: "price_growth", quantity: 1 }], mode: "subscription",
    }));
  });

  it("если customer нет — создаёт нового", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    selectChainMock.mockResolvedValue({ data: { stripe_customer_id: null, email: "a@b.com" } });
    stripeCustomersCreate.mockResolvedValue({ id: "cus_new" });
    updateChainMock.mockResolvedValue({ error: null });
    stripeCheckoutCreate.mockResolvedValue({ url: "https://checkout/abc" });
    const { POST } = await import("@/app/api/stripe/checkout/route");
    await POST(req({ plan: "pro" }));
    expect(stripeCustomersCreate).toHaveBeenCalledWith({ email: "a@b.com", metadata: { seller_id: "u1" } });
  });

  // БАГ 29: origin берётся из whitelist (env APP_URL), не из header
  it("whitelist origin — header в whitelist разрешён", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    selectChainMock.mockResolvedValue({ data: { stripe_customer_id: "cus_x", email: "a@b.com" } });
    stripeCheckoutCreate.mockResolvedValue({ url: "https://x" });
    const { POST } = await import("@/app/api/stripe/checkout/route");
    await POST(req({ plan: "starter" }, "https://app.veloseller.com"));
    expect(stripeCheckoutCreate).toHaveBeenCalledWith(expect.objectContaining({
      success_url: "https://app.veloseller.com/billing?upgraded=1",
      cancel_url: "https://app.veloseller.com/billing?canceled=1",
    }));
  });

  // БАГ 29: атакер с произвольным origin не может перенаправить
  it("whitelist origin — НЕ whitelist origin fallback на дефолт", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    selectChainMock.mockResolvedValue({ data: { stripe_customer_id: "cus_x", email: "a@b.com" } });
    stripeCheckoutCreate.mockResolvedValue({ url: "https://x" });
    const { POST } = await import("@/app/api/stripe/checkout/route");
    await POST(req({ plan: "starter" }, "https://evil.com"));
    // Дефолт — первый в whitelist (https://veloseller.ru)
    expect(stripeCheckoutCreate).toHaveBeenCalledWith(expect.objectContaining({
      success_url: "https://veloseller.ru/billing?upgraded=1",
      cancel_url: "https://veloseller.ru/billing?canceled=1",
    }));
  });
});
