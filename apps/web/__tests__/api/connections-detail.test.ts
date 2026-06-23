/**
 * GET/DELETE /api/connections/[id] — детали и удаление склада.
 *
 * GET маскирует секреты в config (api_key, client_id, token, Shopify access_token).
 * DELETE работает только над собственными складами (.eq seller_id).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { _resetRateLimits } from "@/lib/rate-limit";

const getUserMock = vi.fn();
const maybeSingleMock = vi.fn();
const deleteResultMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: maybeSingleMock })),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: deleteResultMock,
        })),
      })),
    })),
  }),
}));

beforeEach(() => {
  getUserMock.mockReset();
  maybeSingleMock.mockReset();
  deleteResultMock.mockReset();
  deleteResultMock.mockResolvedValue({ error: null, count: 1 });
  _resetRateLimits();
});

async function get(id: string) {
  const { GET } = await import("@/app/api/connections/[id]/route");
  return GET(new Request("http://x") as any, { params: Promise.resolve({ id }) });
}

async function del(id: string) {
  const { DELETE } = await import("@/app/api/connections/[id]/route");
  return DELETE(new Request("http://x", { method: "DELETE" }) as any, { params: Promise.resolve({ id }) });
}

describe("GET /api/connections/[id]", () => {
  it("без авторизации → 401", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await get("c1");
    expect(res.status).toBe(401);
  });

  it("чужой склад или нет в БД → 404", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const res = await get("c-of-other-user");
    expect(res.status).toBe(404);
  });

  it("маскирует секреты в config (api_key, client_id, token)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingleMock.mockResolvedValue({
      data: {
        id: "c1", name: "Ozon FBO", source: "api", marketplace: "ozon",
        status: "active", last_sync_at: null, last_error: null,
        created_at: "2026-01-01", updated_at: "2026-01-01",
        config: {
          client_id: "12345",
          api_key: "sk_secret_token_abc",
          token: "ozon_token_xyz",
          warehouse_kind: "ozon_fbo",  // НЕ секретное — остаётся
        },
      },
      error: null,
    });
    const res = await get("c1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.config.api_key).toBe("••••");
    expect(body.config.client_id).toBe("••••");
    expect(body.config.token).toBe("••••");
    expect(body.config.warehouse_kind).toBe("ozon_fbo");
    // Критично: реальные секреты НЕ должны светиться в ответе
    const fullBody = JSON.stringify(body);
    expect(fullBody).not.toContain("sk_secret_token_abc");
    expect(fullBody).not.toContain("ozon_token_xyz");
  });

  it("маскирует Shopify access_token (раньше утекал — drift списков)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingleMock.mockResolvedValue({
      data: {
        id: "c2", name: "Shopify", source: "marketplace_api", marketplace: "shopify",
        status: "active", last_sync_at: null, last_error: null,
        created_at: "2026-01-01", updated_at: "2026-01-01",
        config: {
          shop: "myshop.myshopify.com",  // НЕ секретное — остаётся
          access_token: "shpat_super_secret_value",
        },
      },
      error: null,
    });
    const res = await get("c2");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.config.access_token).toBe("••••");
    expect(body.config.shop).toBe("myshop.myshopify.com");
    expect(JSON.stringify(body)).not.toContain("shpat_super_secret_value");
  });
});

describe("DELETE /api/connections/[id]", () => {
  it("без авторизации → 401", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await del("c1");
    expect(res.status).toBe(401);
    expect(deleteResultMock).not.toHaveBeenCalled();
  });

  it("чужой склад (count=0) → 404", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    deleteResultMock.mockResolvedValue({ error: null, count: 0 });
    const res = await del("c-of-other-user");
    expect(res.status).toBe(404);
  });

  it("успех: deleted=true", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await del("c1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
  });

  it("DB error → 500 без раскрытия", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    deleteResultMock.mockResolvedValue({ error: { message: "detail leaks" }, count: null });
    const res = await del("c1");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain("detail leaks");
  });
});
