import { describe, it, expect, vi, beforeEach } from "vitest";

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
});

describe("POST /api/alerts/[id]/ack", () => {
  it("без авторизации — 401", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { POST } = await import("@/app/api/alerts/[id]/ack/route");
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(401);
  });

  it("при ошибке БД — 400 с message", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    updateChainMock.mockResolvedValue({ error: { message: "permission denied" } });
    const { POST } = await import("@/app/api/alerts/[id]/ack/route");
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("permission denied");
  });

  it("успех — { ok: true }", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    updateChainMock.mockResolvedValue({ error: null });
    const { POST } = await import("@/app/api/alerts/[id]/ack/route");
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});
