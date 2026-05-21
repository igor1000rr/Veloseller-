/**
 * POST /api/warehouse/select — выбор склада через cookie.
 *
 * КРИТИЧНО: защита от подмены — юзер не должен мочь выбрать чужой warehouse_id.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { _resetRateLimits } from "@/lib/rate-limit";

const getUserMock = vi.fn();
const maybeSingleMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: maybeSingleMock })),
        })),
      })),
    })),
  }),
}));

beforeEach(() => {
  getUserMock.mockReset();
  maybeSingleMock.mockReset();
  _resetRateLimits();
});

function jsonReq(body: any): Request {
  return new Request("http://x/api/warehouse/select", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/warehouse/select", () => {
  it("без авторизации → 401", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { POST } = await import("@/app/api/warehouse/select/route");
    const res = await POST(jsonReq({ warehouse_id: "c1" }) as any);
    expect(res.status).toBe(401);
  });

  it("без warehouse_id → 400", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { POST } = await import("@/app/api/warehouse/select/route");
    const res = await POST(jsonReq({}) as any);
    expect(res.status).toBe(400);
  });

  it("КРИТИЧНО: чужой warehouse_id → 403", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const { POST } = await import("@/app/api/warehouse/select/route");
    const res = await POST(jsonReq({ warehouse_id: "other-users-c1" }) as any);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/не найден/);
    // Cookie НЕ должен быть установлен
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("успех: cookie установлен с httpOnly + sameSite=lax", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingleMock.mockResolvedValue({ data: { id: "c1" }, error: null });
    const { POST } = await import("@/app/api/warehouse/select/route");
    const res = await POST(jsonReq({ warehouse_id: "c1" }) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.warehouse_id).toBe("c1");
    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
  });

  it("DB error → 500 без раскрытия", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: "insider info" } });
    const { POST } = await import("@/app/api/warehouse/select/route");
    const res = await POST(jsonReq({ warehouse_id: "c1" }) as any);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain("insider info");
  });
});
