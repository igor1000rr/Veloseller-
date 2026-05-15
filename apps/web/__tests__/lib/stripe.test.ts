import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("lib/stripe", () => {
  const originalEnv = { ...process.env };
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { process.env = { ...originalEnv }; });

  it("getStripe выбрасывает без STRIPE_SECRET_KEY", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const { getStripe } = await import("@/lib/stripe");
    expect(() => getStripe()).toThrow(/STRIPE_SECRET_KEY не задан/);
  });

  it("getStripe возвращает Stripe instance", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    const { getStripe } = await import("@/lib/stripe");
    const s = getStripe();
    expect(typeof (s as any).customers).toBe("object");
  });

  it("getStripe кеширует singleton", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    const { getStripe } = await import("@/lib/stripe");
    expect(getStripe()).toBe(getStripe());
  });

  it("PLAN_BY_PRICE собирает обратный маппинг", async () => {
    process.env.STRIPE_PRICE_STARTER = "price_s1";
    process.env.STRIPE_PRICE_GROWTH = "price_g1";
    process.env.STRIPE_PRICE_PRO = "price_p1";
    const { PLAN_BY_PRICE } = await import("@/lib/stripe");
    expect(PLAN_BY_PRICE).toEqual({ price_s1: "starter", price_g1: "growth", price_p1: "pro" });
  });

  it("PLAN_BY_PRICE пропускает без price ID", async () => {
    process.env.STRIPE_PRICE_STARTER = "price_s_only";
    delete process.env.STRIPE_PRICE_GROWTH;
    delete process.env.STRIPE_PRICE_PRO;
    const { PLAN_BY_PRICE } = await import("@/lib/stripe");
    expect(PLAN_BY_PRICE).toEqual({ price_s_only: "starter" });
  });
});
