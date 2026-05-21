/**
 * POST /api/alerts/bulk-ack — пакетное подтверждение алертов.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { _resetRateLimits } from "@/lib/rate-limit";

const getUserMock = vi.fn();
const lastQuery: { kind?: string; calls: number } = { calls: 0 };
const finalMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    from: vi.fn(() => {
      // Цепочка: update().eq().is().eq()? — последний .eq() возвращает result
      const chain: any = {
        update: vi.fn(() => chain),
        eq: vi.fn((col: string, val: string) => {
          if (col === "kind") lastQuery.kind = val;
          lastQuery.calls++;
          return chain;
        }),
        is: vi.fn(() => chain),
        then: (resolve: any) => finalMock().then(resolve),
      };
      return chain;
    }),
  }),
}));

beforeEach(() => {
  getUserMock.mockReset();
  finalMock.mockReset();
  lastQuery.kind = undefined;
  lastQuery.calls = 0;
  finalMock.mockResolvedValue({ error: null, count: 7 });
  _resetRateLimits();
});

function jsonReq(body: any): Request {
  return new Request("http://x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/alerts/bulk-ack", () => {
  it("без авторизации → 401", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { POST } = await import("@/app/api/alerts/bulk-ack/route");
    const res = await POST(jsonReq({}) as any);
    expect(res.status).toBe(401);
    expect(finalMock).not.toHaveBeenCalled();
  });

  it("невалидный kind → 400", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { POST } = await import("@/app/api/alerts/bulk-ack/route");
    const res = await POST(jsonReq({ kind: "badkind" }) as any);
    expect(res.status).toBe(400);
    expect(finalMock).not.toHaveBeenCalled();
  });

  it("без kind: подтверждает все активные", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { POST } = await import("@/app/api/alerts/bulk-ack/route");
    const res = await POST(jsonReq({}) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.acknowledged).toBe(7);
    expect(lastQuery.kind).toBeUndefined();
  });

  it("с kind=low_stock: фильтрует по этому типу", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { POST } = await import("@/app/api/alerts/bulk-ack/route");
    const res = await POST(jsonReq({ kind: "low_stock" }) as any);
    expect(res.status).toBe(200);
    expect(lastQuery.kind).toBe("low_stock");
  });

  it("DB error → 500 без раскрытия SQL", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    finalMock.mockResolvedValue({ error: { message: "permission denied" }, count: null });
    const { POST } = await import("@/app/api/alerts/bulk-ack/route");
    const res = await POST(jsonReq({}) as any);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain("permission denied");
  });
});
