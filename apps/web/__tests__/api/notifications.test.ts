import { describe, it, expect, vi, beforeEach } from "vitest";
import { _resetRateLimits } from "@/lib/rate-limit";

const getUserMock = vi.fn();
const updateChainMock = vi.fn();
let capturedUpdate: any = null;
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    from: vi.fn(() => ({
      update: vi.fn((data: any) => {
        capturedUpdate = data;
        return { eq: updateChainMock };
      }),
    })),
  }),
}));

beforeEach(() => {
  getUserMock.mockReset();
  updateChainMock.mockReset();
  capturedUpdate = null;
  _resetRateLimits();
});

function req(body: any) {
  return new Request("http://x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/notifications", () => {
  it("без авторизации — 401", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { POST } = await import("@/app/api/notifications/route");
    const res = await POST(req({}));
    expect(res.status).toBe(401);
  });

  it("разрешённые поля прокидываются в update", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    updateChainMock.mockResolvedValue({ error: null });
    const { POST } = await import("@/app/api/notifications/route");
    await POST(req({
      display_name: "Игорь",
      timezone: "Europe/Minsk",
      telegram_chat_id: "12345",
      notify_email: false,
      notify_telegram: true,
    }));
    expect(capturedUpdate).toEqual({
      display_name: "Игорь",
      timezone: "Europe/Minsk",
      telegram_chat_id: "12345",
      notify_email: false,
      notify_telegram: true,
    });
  });

  it("неразрешённые поля отбрасываются", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    updateChainMock.mockResolvedValue({ error: null });
    const { POST } = await import("@/app/api/notifications/route");
    await POST(req({ display_name: "X", plan: "pro", id: "evil-user" }));
    expect(capturedUpdate).toEqual({ display_name: "X" });
    expect(capturedUpdate).not.toHaveProperty("plan");
    expect(capturedUpdate).not.toHaveProperty("id");
  });

  it("при ошибке БД — 500 без разглашения SQL detail (БАГ 78)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    updateChainMock.mockResolvedValue({ error: { message: "db error" } });
    const { POST } = await import("@/app/api/notifications/route");
    const res = await POST(req({ timezone: "Europe/Minsk" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    // БАГ 78: error.message НЕ должен утечь наружу
    expect(body.error).not.toContain("db error");
    expect(body.error).toBeDefined();
  });

  it("невалидный timezone — 400", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { POST } = await import("@/app/api/notifications/route");
    const res = await POST(req({ timezone: "Москва с пробелами!" }));
    expect(res.status).toBe(400);
  });

  it("notify_email не boolean — 400", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { POST } = await import("@/app/api/notifications/route");
    const res = await POST(req({ notify_email: "yes" }));
    expect(res.status).toBe(400);
  });
});
