import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// БАГ 29: тесты обновлены под whitelist origin. Дефолт APP_URL = первый из списка.
process.env.APP_URL = "https://veloseller.ru,https://app.veloseller.com";

const getUserMock = vi.fn();
const selectChainMock = vi.fn();
const portalCreate = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single: selectChainMock })) })) })),
  }),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ billingPortal: { sessions: { create: portalCreate } } }),
}));

beforeEach(() => {
  getUserMock.mockReset();
  selectChainMock.mockReset();
  portalCreate.mockReset();
});

function req(origin = "https://app.veloseller.com") {
  return new NextRequest("http://x", { method: "POST", headers: { origin } });
}

describe("POST /api/stripe/portal", () => {
  it("без авторизации — 401", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { POST } = await import("@/app/api/stripe/portal/route");
    expect((await POST(req())).status).toBe(401);
  });

  it("без активной подписки — 400", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    selectChainMock.mockResolvedValue({ data: { stripe_customer_id: null } });
    const { POST } = await import("@/app/api/stripe/portal/route");
    expect((await POST(req())).status).toBe(400);
  });

  it("успешно — возвращает url (whitelisted origin)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    selectChainMock.mockResolvedValue({ data: { stripe_customer_id: "cus_abc" } });
    portalCreate.mockResolvedValue({ url: "https://billing.stripe.com/xyz" });
    const { POST } = await import("@/app/api/stripe/portal/route");
    const res = await POST(req("https://app.veloseller.com"));
    expect(res.status).toBe(200);
    expect(portalCreate).toHaveBeenCalledWith({
      customer: "cus_abc",
      return_url: "https://app.veloseller.com/billing",
    });
  });

  // БАГ 29: атакер с произвольным origin не может перенаправить
  it("non-whitelist origin → fallback на дефолт", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    selectChainMock.mockResolvedValue({ data: { stripe_customer_id: "cus_abc" } });
    portalCreate.mockResolvedValue({ url: "https://billing.stripe.com/xyz" });
    const { POST } = await import("@/app/api/stripe/portal/route");
    await POST(req("https://evil.com"));
    expect(portalCreate).toHaveBeenCalledWith({
      customer: "cus_abc",
      return_url: "https://veloseller.ru/billing",
    });
  });
});
