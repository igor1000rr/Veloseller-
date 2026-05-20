import { describe, it, expect, vi, beforeEach } from "vitest";
import { _resetRateLimits } from "@/lib/rate-limit";

const getUserMock = vi.fn();
const insertChainMock = vi.fn();
let capturedInsert: any = null;
let existingCount = 0;

// from() вызывается дважды: 1) .select("id", {count}) для проверки лимита, 2) .insert(...).select.single() для создания
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    from: vi.fn(() => ({
      // Для проверки лимита
      select: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ count: existingCount, error: null }),
      })),
      insert: vi.fn((data: any) => {
        capturedInsert = data;
        return {
          select: vi.fn(() => ({ single: insertChainMock })),
        };
      }),
    })),
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
    const res = await POST(req({ source: "csv_upload" }) as any);
    expect(res.status).toBe(401);
  });

  it("без source — 400", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { POST } = await import("@/app/api/connections/route");
    const res = await POST(req({}) as any);
    expect(res.status).toBe(400);
  });

  it("invalid source — 400", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { POST } = await import("@/app/api/connections/route");
    const res = await POST(req({ source: "evil_hack" }) as any);
    expect(res.status).toBe(400);
  });

  it("invalid marketplace — 400", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { POST } = await import("@/app/api/connections/route");
    const res = await POST(req({ source: "marketplace_api", marketplace: "evilbay" }) as any);
    expect(res.status).toBe(400);
  });

  it("invalid JSON — 400", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const failingReq = { json: async () => { throw new Error("bad json"); }, headers: new Headers(), method: "POST", url: "http://x" } as any;
    const { POST } = await import("@/app/api/connections/route");
    const res = await POST(failingReq);
    expect(res.status).toBe(400);
  });

  it("шифрует sensitive поля для Ozon", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    insertChainMock.mockResolvedValue({ data: { id: "c1" }, error: null });
    const { POST } = await import("@/app/api/connections/route");
    await POST(req({ source: "marketplace_api", marketplace: "ozon", config: { client_id: "12345", api_key: "secret-key" } }) as any);
    expect(capturedInsert.config.client_id).toBe("enc:12345");
    expect(capturedInsert.config.api_key).toBe("enc:secret-key");
    expect(capturedInsert.config._encrypted).toBe(true);
  });

  it("шифрует token для WB", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    insertChainMock.mockResolvedValue({ data: { id: "c1" }, error: null });
    const { POST } = await import("@/app/api/connections/route");
    await POST(req({ source: "marketplace_api", marketplace: "wildberries", config: { token: "wb-token-xyz" } }) as any);
    expect(capturedInsert.config.token).toBe("enc:wb-token-xyz");
  });

  it("НЕ шифрует config для google_sheet", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    insertChainMock.mockResolvedValue({ data: { id: "c1" }, error: null });
    const { POST } = await import("@/app/api/connections/route");
    await POST(req({ source: "google_sheet", config: { sheet_url: "https://docs.google.com/x" } }) as any);
    expect(capturedInsert.config.sheet_url).toBe("https://docs.google.com/x");
    expect(capturedInsert.config._encrypted).toBeUndefined();
  });

  it("seller_id берётся из user — anti tampering", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "real-user" } } });
    insertChainMock.mockResolvedValue({ data: { id: "c1" }, error: null });
    const { POST } = await import("@/app/api/connections/route");
    await POST(req({ source: "csv_upload", seller_id: "victim-user", config: {} }) as any);
    expect(capturedInsert.seller_id).toBe("real-user");
  });

  it("при ошибке БД — 400 без разглашения SQL detail (БАГ 78)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    insertChainMock.mockResolvedValue({ data: null, error: { message: "rls fail" } });
    const { POST } = await import("@/app/api/connections/route");
    const res = await POST(req({ source: "csv_upload", config: {} }) as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    // БАГ 78: error.message НЕ должен утечь наружу
    expect(body.error).not.toContain("rls");
    expect(body.error).toBeDefined();
  });

  it("лимит connections превышен — 400", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    existingCount = 20;  // равно MAX_CONNECTIONS_PER_SELLER
    const { POST } = await import("@/app/api/connections/route");
    const res = await POST(req({ source: "csv_upload", config: {} }) as any);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/лимит/i);
  });
});
