import { describe, it, expect, vi, beforeEach } from "vitest";
import { _resetRateLimits } from "@/lib/rate-limit";

const getUserMock = vi.fn();
const updateChainMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: updateChainMock,
        })),
      })),
    })),
  }),
}));

beforeEach(() => {
  getUserMock.mockReset();
  updateChainMock.mockReset();
  _resetRateLimits();
});

describe("POST /api/alerts/[id]/ack", () => {
  it("без авторизации — 401", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { POST } = await import("@/app/api/alerts/[id]/ack/route");
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(401);
  });

  it("при ошибке БД — 500 без разглашения SQL detail (БАГ 78)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    updateChainMock.mockResolvedValue({ error: { message: "permission denied" }, count: null });
    const { POST } = await import("@/app/api/alerts/[id]/ack/route");
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(500);
    const body = await res.json();
    // БАГ 78: error.message НЕ должен утечь наружу — возвращаем общий текст.
    expect(body.error).not.toContain("permission denied");
    expect(body.error).toBeDefined();
  });

  it("если alert не найден — 404", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    updateChainMock.mockResolvedValue({ error: null, count: 0 });
    const { POST } = await import("@/app/api/alerts/[id]/ack/route");
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(404);
  });

  it("успех — { ok: true }", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    updateChainMock.mockResolvedValue({ error: null, count: 1 });
    const { POST } = await import("@/app/api/alerts/[id]/ack/route");
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});
