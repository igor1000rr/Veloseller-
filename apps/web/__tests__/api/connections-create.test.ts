import { describe, it, expect, vi, beforeEach } from "vitest";
import { _resetRateLimits } from "@/lib/rate-limit";

const getUserMock = vi.fn();
const insertChainMock = vi.fn();
let capturedInsert: any = null;
let existingCount = 0;
let sellerPlan = "pro";
let sellerLimit = 15;

// from() вызывается трижды:
//   1) sellers.select("plan_warehouses_limit, plan").eq.single — для лимита
//   2) data_connections.select("id", {count}).eq — для подсчёта текущих
//   3) data_connections.insert(...).select.single — для создания
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    from: vi.fn((table: string) => {
      if (table === "sellers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { plan_warehouses_limit: sellerLimit, plan: sellerPlan },
                error: null,
              }),
            })),
          })),
        };
      }
      // data_connections
      return {
        select: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ count: existingCount, error: null }),
        })),
        insert: vi.fn((data: any) => {
          capturedInsert = data;
          return {
            select: vi.fn(() => ({ single: insertChainMock })),
          };
        }),
      };
    }),
  }),
}));

vi.mock("@/lib/crypto", () => ({
  isEncryptionConfigured: () => true,
  encrypt: (v: string) => `enc:${v}`,
}));

beforeEach(() => {
  getUserMock.mockReset();
  insertChainMock.mockReset();
  capturedInsert = null;
  existingCount = 0;
  sellerPlan = "pro";
  sellerLimit = 15;
  _resetRateLimits();
});

function req(body: any) {
  return new Request("http://x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/connections", () => {
  it("без авторизации — 401", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { POST } = await import("@/app/api/connections/route");
    const res = await POST(req({ warehouse_kind: "ozon_fbo", name: "X" }) as any);
    expect(res.status).toBe(401);
  });

  it("без warehouse_kind и без source — 400", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { POST } = await import("@/app/api/connections/route");
    const res = await POST(req({ name: "X" }) as any);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/warehouse_kind/i);
  });

  it("невалидный warehouse_kind — 400", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { POST } = await import("@/app/api/connections/route");
    const res = await POST(req({ warehouse_kind: "evil_hack", name: "X" }) as any);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/warehouse_kind/i);
  });

  it("без name — 400 (название склада обязательно)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { POST } = await import("@/app/api/connections/route");
    const res = await POST(req({ warehouse_kind: "ozon_fbo" }) as any);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/название/i);
  });

  it("пустое name — 400", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { POST } = await import("@/app/api/connections/route");
    const res = await POST(req({ warehouse_kind: "ozon_fbo", name: "   " }) as any);
    expect(res.status).toBe(400);
  });

  it("invalid JSON — 400", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const failingReq = { json: async () => { throw new Error("bad json"); }, headers: new Headers(), method: "POST", url: "http://x" } as any;
    const { POST } = await import("@/app/api/connections/route");
    const res = await POST(failingReq);
    expect(res.status).toBe(400);
  });

  it("шифрует sensitive поля для ozon_fbo", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    insertChainMock.mockResolvedValue({ data: { id: "c1" }, error: null });
    const { POST } = await import("@/app/api/connections/route");
    await POST(req({
      warehouse_kind: "ozon_fbo", name: "Мой Ozon FBO",
      config: { client_id: "12345", api_key: "secret-key" },
    }) as any);
    expect(capturedInsert.config.client_id).toBe("enc:12345");
    expect(capturedInsert.config.api_key).toBe("enc:secret-key");
    expect(capturedInsert.config._encrypted).toBe(true);
  });

  it("шифрует sensitive поля для ozon_fbs (тот же API-ключ)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    insertChainMock.mockResolvedValue({ data: { id: "c2" }, error: null });
    const { POST } = await import("@/app/api/connections/route");
    await POST(req({
      warehouse_kind: "ozon_fbs", name: "Мой Ozon FBS",
      config: { client_id: "12345", api_key: "secret-key" },
    }) as any);
    expect(capturedInsert.config.client_id).toBe("enc:12345");
    expect(capturedInsert.config.api_key).toBe("enc:secret-key");
  });

  it("шифрует token для wb_fbo", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    insertChainMock.mockResolvedValue({ data: { id: "c1" }, error: null });
    const { POST } = await import("@/app/api/connections/route");
    await POST(req({
      warehouse_kind: "wb_fbo", name: "Мой WB FBO",
      config: { token: "wb-token-xyz" },
    }) as any);
    expect(capturedInsert.config.token).toBe("enc:wb-token-xyz");
  });

  it("НЕ шифрует config для google_sheet", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    insertChainMock.mockResolvedValue({ data: { id: "c1" }, error: null });
    const { POST } = await import("@/app/api/connections/route");
    await POST(req({
      warehouse_kind: "google_sheet", name: "Мой Google Sheet",
      config: { sheet_url: "https://docs.google.com/x" },
    }) as any);
    expect(capturedInsert.config.sheet_url).toBe("https://docs.google.com/x");
    expect(capturedInsert.config._encrypted).toBeUndefined();
  });

  it("записывает warehouse_kind в БД", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    insertChainMock.mockResolvedValue({ data: { id: "c1" }, error: null });
    const { POST } = await import("@/app/api/connections/route");
    await POST(req({
      warehouse_kind: "ozon_fbs", name: "FBS",
      config: { client_id: "1", api_key: "k" },
    }) as any);
    expect(capturedInsert.warehouse_kind).toBe("ozon_fbs");
    expect(capturedInsert.source).toBe("marketplace_api");
    expect(capturedInsert.marketplace).toBe("ozon");
  });

  it("выводит source/marketplace из warehouse_kind для google_sheet", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    insertChainMock.mockResolvedValue({ data: { id: "c1" }, error: null });
    const { POST } = await import("@/app/api/connections/route");
    await POST(req({
      warehouse_kind: "google_sheet", name: "GS",
      config: {},
    }) as any);
    expect(capturedInsert.source).toBe("google_sheet");
    expect(capturedInsert.marketplace).toBe(null);
  });

  it("seller_id берётся из user — anti tampering", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "real-user" } } });
    insertChainMock.mockResolvedValue({ data: { id: "c1" }, error: null });
    const { POST } = await import("@/app/api/connections/route");
    await POST(req({
      warehouse_kind: "google_sheet", name: "X",
      seller_id: "victim-user", config: {},
    }) as any);
    expect(capturedInsert.seller_id).toBe("real-user");
  });

  it("при ошибке БД — 400 без разглашения SQL detail (БАГ 78)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    insertChainMock.mockResolvedValue({ data: null, error: { message: "rls fail" } });
    const { POST } = await import("@/app/api/connections/route");
    const res = await POST(req({ warehouse_kind: "google_sheet", name: "X", config: {} }) as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).not.toContain("rls");
    expect(body.error).toBeDefined();
  });

  it("лимит складов превышен — 402 Payment Required", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    sellerLimit = 2;
    sellerPlan = "starter";
    existingCount = 2;
    const { POST } = await import("@/app/api/connections/route");
    const res = await POST(req({ warehouse_kind: "ozon_fbo", name: "X" }) as any);
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe("warehouse_limit_reached");
    expect(body.limit).toBe(2);
    expect(body.error).toMatch(/тариф|лимит/i);
  });

  it("лимит для trial = 15 (как у pro)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    sellerLimit = 15;
    sellerPlan = "trial";
    existingCount = 14; // ещё помещается
    insertChainMock.mockResolvedValue({ data: { id: "c1" }, error: null });
    const { POST } = await import("@/app/api/connections/route");
    const res = await POST(req({ warehouse_kind: "google_sheet", name: "GS", config: {} }) as any);
    expect(res.status).toBe(200);
  });

  it("backward compat: source='google_sheet' без warehouse_kind работает", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    insertChainMock.mockResolvedValue({ data: { id: "c1" }, error: null });
    const { POST } = await import("@/app/api/connections/route");
    const res = await POST(req({
      source: "google_sheet", name: "Legacy GS", config: {},
    }) as any);
    expect(res.status).toBe(200);
    expect(capturedInsert.warehouse_kind).toBe("google_sheet");
  });

  it("backward compat: source=marketplace_api+marketplace=ozon → ozon_fbo", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    insertChainMock.mockResolvedValue({ data: { id: "c1" }, error: null });
    const { POST } = await import("@/app/api/connections/route");
    await POST(req({
      source: "marketplace_api", marketplace: "ozon",
      name: "Legacy Ozon", config: { client_id: "x", api_key: "y" },
    }) as any);
    expect(capturedInsert.warehouse_kind).toBe("ozon_fbo");
  });
});
