import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const constructEventMock = vi.fn();
const subscriptionsRetrieveMock = vi.fn();
const updateChainMock = vi.fn();
const fromMock = vi.fn();
const eqMock = vi.fn();

// Для select(...).eq(...).maybeSingle() chain (БАГ 62 + БАГ 103)
const selectMock = vi.fn();
const selectEqMock = vi.fn();
const maybeSingleMock = vi.fn();

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

  // Default: select().eq().maybeSingle() возвращает null (нет seller в БД)
  maybeSingleMock.mockResolvedValue({ data: null, error: null });
  selectEqMock.mockReturnValue({ maybeSingle: maybeSingleMock });
  selectMock.mockReturnValue({ eq: selectEqMock });

  eqMock.mockResolvedValue({ data: null, error: null });
  updateChainMock.mockReturnValue({ eq: eqMock });
  fromMock.mockReturnValue({
    update: updateChainMock,
    select: selectMock,
  });
});

async function callWebhook(body: string, sig: string | null) {
  const { POST } = await import("@/app/api/stripe/webhook/route");
  const headers = new Headers();
  if (sig) headers.set("stripe-signature", sig);
  return POST(new NextRequest("http://localhost/api/stripe/webhook", { method: "POST", headers, body }));
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

  it("subscription.deleted — на trial, обнуляет sub_id (нет активной в БД)", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    constructEventMock.mockReturnValue({
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_789", metadata: { seller_id: "seller-3" } } },
    });
    await callWebhook("{}", "sig");
    expect(updateChainMock.mock.calls[0][0]).toEqual({
      plan: "trial", subscription_status: "canceled", stripe_subscription_id: null,
    });
  });

  it("subscription.deleted — обновляет если sub.id совпадает с текущим в БД", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { stripe_subscription_id: "sub_789" }, error: null,
    });
    constructEventMock.mockReturnValue({
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_789", metadata: { seller_id: "seller-3" } } },
    });
    await callWebhook("{}", "sig");
    expect(updateChainMock.mock.calls[0][0]).toEqual({
      plan: "trial", subscription_status: "canceled", stripe_subscription_id: null,
    });
  });

  it("БАГ 62: subscription.deleted IGNORED если seller имеет другую активную подписку", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { stripe_subscription_id: "sub_NEW" }, error: null,
    });
    constructEventMock.mockReturnValue({
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_OLD", metadata: { seller_id: "seller-3" } } },
    });
    await callWebhook("{}", "sig");
    expect(updateChainMock).not.toHaveBeenCalled();
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
    // Реально unknown event (БАГ 103: invoice.payment_failed теперь обрабатывается)
    constructEventMock.mockReturnValue({ type: "customer.discount.created", data: { object: {} } });
    const res = await callWebhook("{}", "sig");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(updateChainMock).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // БАГ 103: invoice.payment_failed / invoice.payment_succeeded handlers
  // ==========================================================================

  describe("БАГ 103: invoice.payment_failed", () => {
    it("инкрементирует payment_failure_count и пишет timestamp", async () => {
      // Setup: invoice → subscription_details.metadata.seller_id (Stripe 2024+)
      // Текущий count = 1
      maybeSingleMock.mockResolvedValue({
        data: { payment_failure_count: 1 }, error: null,
      });
      constructEventMock.mockReturnValue({
        type: "invoice.payment_failed",
        data: { object: {
          id: "in_001",
          subscription_details: { metadata: { seller_id: "seller-pf" } },
          billing_reason: "subscription_cycle",
          last_finalization_error: { message: "Your card was declined." },
        }},
      });
      const res = await callWebhook("{}", "sig");
      expect(res.status).toBe(200);

      // Должен быть UPDATE с инкрементированным counter
      expect(updateChainMock).toHaveBeenCalled();
      const payload = updateChainMock.mock.calls[0][0];
      expect(payload.payment_failure_count).toBe(2);  // 1 + 1
      expect(payload.last_payment_failed_reason).toContain("declined");
      expect(payload.last_payment_failed_at).toBeTruthy();
    });

    it("сохраняет billing_reason если last_finalization_error пустой", async () => {
      maybeSingleMock.mockResolvedValue({
        data: { payment_failure_count: 0 }, error: null,
      });
      constructEventMock.mockReturnValue({
        type: "invoice.payment_failed",
        data: { object: {
          id: "in_002",
          subscription_details: { metadata: { seller_id: "seller-pf2" } },
          billing_reason: "automatic_pending_invoice_item_invoice",
          // last_finalization_error отсутствует
        }},
      });
      await callWebhook("{}", "sig");
      const payload = updateChainMock.mock.calls[0][0];
      expect(payload.last_payment_failed_reason).toBe("automatic_pending_invoice_item_invoice");
      expect(payload.payment_failure_count).toBe(1);
    });

    it("fallback: retrieve subscription для seller_id если invoice не содержит metadata", async () => {
      maybeSingleMock.mockResolvedValue({
        data: { payment_failure_count: 0 }, error: null,
      });
      // invoice без subscription_details.metadata, но с subscription id
      constructEventMock.mockReturnValue({
        type: "invoice.payment_failed",
        data: { object: {
          id: "in_003",
          subscription: "sub_lookup",
          billing_reason: "subscription_cycle",
        }},
      });
      subscriptionsRetrieveMock.mockResolvedValue({
        id: "sub_lookup",
        metadata: { seller_id: "seller-from-sub" },
      });
      await callWebhook("{}", "sig");
      expect(subscriptionsRetrieveMock).toHaveBeenCalledWith("sub_lookup");
      expect(updateChainMock).toHaveBeenCalled();
    });

    it("fallback: lookup seller по stripe_customer_id если subscription отсутствует", async () => {
      // Первый maybeSingle для select(id).eq(stripe_customer_id) → seller найден
      maybeSingleMock
        .mockResolvedValueOnce({ data: { id: "seller-by-customer" }, error: null })
        // Второй для select(payment_failure_count).eq(id) → текущий counter
        .mockResolvedValueOnce({ data: { payment_failure_count: 0 }, error: null });

      constructEventMock.mockReturnValue({
        type: "invoice.payment_failed",
        data: { object: {
          id: "in_004",
          customer: "cus_abc",
          billing_reason: "subscription_cycle",
        }},
      });
      await callWebhook("{}", "sig");
      // Should have looked up by customer
      expect(fromMock).toHaveBeenCalledWith("sellers");
      expect(updateChainMock).toHaveBeenCalled();
    });

    it("если seller не найден — silently ignore (warn в логе)", async () => {
      maybeSingleMock.mockResolvedValue({ data: null, error: null });
      constructEventMock.mockReturnValue({
        type: "invoice.payment_failed",
        data: { object: {
          id: "in_005",
          customer: "cus_unknown",
          billing_reason: "subscription_cycle",
        }},
      });
      const res = await callWebhook("{}", "sig");
      // 200 — Stripe не retry'ит
      expect(res.status).toBe(200);
      // UPDATE НЕ вызван — нечего обновлять
      expect(updateChainMock).not.toHaveBeenCalled();
    });
  });

  describe("БАГ 103: invoice.payment_succeeded", () => {
    it("сбрасывает payment_failure_count и last_payment_failed_*", async () => {
      constructEventMock.mockReturnValue({
        type: "invoice.payment_succeeded",
        data: { object: {
          id: "in_ok_001",
          subscription_details: { metadata: { seller_id: "seller-ok" } },
        }},
      });
      await callWebhook("{}", "sig");

      const payload = updateChainMock.mock.calls[0][0];
      expect(payload.payment_failure_count).toBe(0);
      expect(payload.last_payment_failed_at).toBeNull();
      expect(payload.last_payment_failed_reason).toBeNull();
      expect(payload.last_payment_succeeded_at).toBeTruthy();
    });

    it("если seller не найден — silently ignore (без warn)", async () => {
      maybeSingleMock.mockResolvedValue({ data: null, error: null });
      constructEventMock.mockReturnValue({
        type: "invoice.payment_succeeded",
        data: { object: {
          id: "in_ok_002",
          customer: "cus_unknown",
        }},
      });
      const res = await callWebhook("{}", "sig");
      expect(res.status).toBe(200);
      expect(updateChainMock).not.toHaveBeenCalled();
    });
  });
});
