import { describe, it, expect, vi, beforeEach } from "vitest";

const constructEventMock = vi.fn();
const subscriptionsRetrieveMock = vi.fn();
const updateChainMock = vi.fn();
const fromMock = vi.fn();
const eqMock = vi.fn();

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    webhooks: { constructEvent: constructEventMock },
    subscriptions: { retrieve: subscriptionsRetrieveMock },
  }),
  PLAN_BY_PRICE: { price_starter: "starter", price_growth: "growth", price_pro: "pro" },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: fromMock }),
}));

beforeEach(() => {
  vi.resetAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  eqMock.mockResolvedValue({ data: null, error: null });
  updateChainMock.mockReturnValue({ eq: eqMock });
  fromMock.mockReturnValue({ update: updateChainMock });
});

async function callWebhook(body: string, sig: string | null) {
  const { POST } = await import("@/app/api/stripe/webhook/route");
  const headers = new Headers();
  if (sig) headers.set("stripe-signature", sig);
  return POST(new Request("http://localhost/api/stripe/webhook", { method: "POST", headers, body }));
}

describe("POST /api/stripe/webhook", () => {
  it("400 если нет stripe-signature", async () => {
    const res = await callWebhook("{}", null);
    expect(res.status).toBe(400);
  });

  it("400 если webhook secret не задан", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await callWebhook("{}", "sig");
    expect(res.status).toBe(400);
  });

  it("400 если подпись невалидна", async () => {
    constructEventMock.mockImplementation(() => { throw new Error("Invalid signature"); });
    const res = await callWebhook("{}", "bad-sig");
    expect(res.status).toBe(400);
  });

  it("subscription.created — обновляет plan + status", async () => {
    constructEventMock.mockReturnValue({
      type: "customer.subscription.created",
      data: { object: {
        id: "sub_123", status: "active",
        metadata: { seller_id: "seller-1" },
        items: { data: [{ price: { id: "price_growth" } }] },
        current_period_end: 1735689600,
      }},
    });
    const res = await callWebhook("{}", "sig");
    expect(res.status).toBe(200);
    expect(fromMock).toHaveBeenCalledWith("sellers");
    expect(updateChainMock.mock.calls[0][0]).toMatchObject({
      stripe_subscription_id: "sub_123",
      subscription_status: "active",
      plan: "growth",
    });
  });

  it("subscription.updated — мапит price_pro → pro", async () => {
    constructEventMock.mockReturnValue({
      type: "customer.subscription.updated",
      data: { object: {
        id: "sub_456", status: "active",
        metadata: { seller_id: "seller-2" },
        items: { data: [{ price: { id: "price_pro" } }] },
        current_period_end: 1735689600,
      }},
    });
    await callWebhook("{}", "sig");
    expect(updateChainMock.mock.calls[0][0].plan).toBe("pro");
  });

  it("subscription.deleted — на trial, обнуляет sub_id", async () => {
    constructEventMock.mockReturnValue({
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_789", metadata: { seller_id: "seller-3" } } },
    });
    await callWebhook("{}", "sig");
    expect(updateChainMock.mock.calls[0][0]).toEqual({
      plan: "trial", subscription_status: "canceled", stripe_subscription_id: null,
    });
  });

  it("deleted без seller_id — не обновляет", async () => {
    constructEventMock.mockReturnValue({
      type: "customer.subscription.deleted",
      data: { object: { id: "sub", metadata: {} } },
    });
    await callWebhook("{}", "sig");
    expect(updateChainMock).not.toHaveBeenCalled();
  });

  it("неизвестный price ID — plan undefined, status да", async () => {
    constructEventMock.mockReturnValue({
      type: "customer.subscription.updated",
      data: { object: {
        id: "sub_x", status: "past_due",
        metadata: { seller_id: "seller-x" },
        items: { data: [{ price: { id: "price_unknown" } }] },
        current_period_end: 1735689600,
      }},
    });
    await callWebhook("{}", "sig");
    expect(updateChainMock.mock.calls[0][0].plan).toBeUndefined();
    expect(updateChainMock.mock.calls[0][0].subscription_status).toBe("past_due");
  });

  it("checkout.session.completed — retrieve + apply", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { subscription: "sub_str", metadata: { seller_id: "seller-5" } } },
    });
    subscriptionsRetrieveMock.mockResolvedValue({
      id: "sub_str", status: "active",
      metadata: { seller_id: "seller-5" },
      items: { data: [{ price: { id: "price_starter" } }] },
      current_period_end: 1735689600,
    });
    await callWebhook("{}", "sig");
    expect(updateChainMock.mock.calls[0][0].plan).toBe("starter");
  });

  it("unknown event — 200 received:true", async () => {
    constructEventMock.mockReturnValue({ type: "invoice.payment_failed", data: { object: {} } });
    const res = await callWebhook("{}", "sig");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(updateChainMock).not.toHaveBeenCalled();
  });
});
