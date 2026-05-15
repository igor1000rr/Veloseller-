import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
const insertChainMock = vi.fn();
let capturedInsert: any = null;

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    from: vi.fn(() => ({
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
});

function req(body: any) {
  return {
    json: async () => body,
  } as any;
}

describe("POST /api/connections", () => {
  it("без авторизации — 401", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { POST } = await import("@/app/api/connections/route");
    const res = await POST(req({ source: "csv_upload" }));
    expect(res.status).toBe(401);
  });

  it("без source — 400", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { POST } = await import("@/app/api/connections/route");
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("invalid JSON — 400", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const failingReq = { json: async () => { throw new Error("bad json"); } } as any;
    const { POST } = await import("@/app/api/connections/route");
    const res = await POST(failingReq);
    expect(res.status).toBe(400);
  });

  it("шифрует sensitive поля для Ozon", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    insertChainMock.mockResolvedValue({ data: { id: "c1" }, error: null });
    const { POST } = await import("@/app/api/connections/route");
    await POST(req({ source: "marketplace_api", marketplace: "ozon", config: { client_id: "12345", api_key: "secret-key" } }));
    expect(capturedInsert.config.client_id).toBe("enc:12345");
    expect(capturedInsert.config.api_key).toBe("enc:secret-key");
    expect(capturedInsert.config._encrypted).toBe(true);
  });

  it("шифрует token для WB", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    insertChainMock.mockResolvedValue({ data: { id: "c1" }, error: null });
    const { POST } = await import("@/app/api/connections/route");
    await POST(req({ source: "marketplace_api", marketplace: "wildberries", config: { token: "wb-token-xyz" } }));
    expect(capturedInsert.config.token).toBe("enc:wb-token-xyz");
  });

  it("НЕ шифрует config для google_sheet", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    insertChainMock.mockResolvedValue({ data: { id: "c1" }, error: null });
    const { POST } = await import("@/app/api/connections/route");
    await POST(req({ source: "google_sheet", config: { sheet_url: "https://docs.google.com/x" } }));
    expect(capturedInsert.config.sheet_url).toBe("https://docs.google.com/x");
    expect(capturedInsert.config._encrypted).toBeUndefined();
  });

  it("seller_id берётся из user — anti tampering", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "real-user" } } });
    insertChainMock.mockResolvedValue({ data: { id: "c1" }, error: null });
    const { POST } = await import("@/app/api/connections/route");
    await POST(req({ source: "csv_upload", seller_id: "victim-user", config: {} }));
    expect(capturedInsert.seller_id).toBe("real-user");
  });

  it("при ошибке БД — 400", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    insertChainMock.mockResolvedValue({ data: null, error: { message: "rls fail" } });
    const { POST } = await import("@/app/api/connections/route");
    const res = await POST(req({ source: "csv_upload", config: {} }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("rls fail");
  });
});
