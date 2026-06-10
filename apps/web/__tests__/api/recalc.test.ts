import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getUserMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

beforeEach(() => {
  getUserMock.mockReset();
  global.fetch = vi.fn();
  process.env.WORKER_URL = "http://worker:8001";
  process.env.WORKER_SECRET = "secret-xyz";
});

describe("POST /api/jobs/recalc", () => {
  it("без авторизации — 401", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { POST } = await import("@/app/api/jobs/recalc/route");
    const res = await POST(new NextRequest("http://localhost/api/jobs/recalc", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("проксирует запрос на worker с user.id и worker secret", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-123" } } });
    (global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ metrics_written: 5 }) });
    const { POST } = await import("@/app/api/jobs/recalc/route");
    const res = await POST(new NextRequest("http://localhost/api/jobs/recalc", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://worker:8001/jobs/recalc/user-123",
      expect.objectContaining({
        method: "POST",
        headers: { "X-Worker-Secret": "secret-xyz" },
      }),
    );
  });

  it("если worker вернул не-ok — 502", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    (global.fetch as any).mockResolvedValue({ ok: false, status: 500, text: async () => "Internal error" });
    const { POST } = await import("@/app/api/jobs/recalc/route");
    const res = await POST(new NextRequest("http://localhost/api/jobs/recalc", { method: "POST" }));
    expect(res.status).toBe(502);
  });

  it("если сеть упала — 502", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    (global.fetch as any).mockRejectedValue(new Error("ECONNREFUSED"));
    const { POST } = await import("@/app/api/jobs/recalc/route");
    const res = await POST(new NextRequest("http://localhost/api/jobs/recalc", { method: "POST" }));
    expect(res.status).toBe(502);
  });
});
