import { describe, it, expect, vi, beforeEach } from "vitest";

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
  });

  it("при ошибке БД — 400", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    updateChainMock.mockResolvedValue({ error: { message: "tz invalid" } });
    const { POST } = await import("@/app/api/notifications/route");
    const res = await POST(req({ timezone: "X/Y" }));
    expect(res.status).toBe(400);
  });
});
