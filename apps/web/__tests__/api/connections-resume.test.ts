/**
 * POST /api/connections/[id]/resume — снятие склада с паузы.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { _resetRateLimits } from "@/lib/rate-limit";

const getUserMock = vi.fn();
const maybeSingleMock = vi.fn();
const updateResultMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: maybeSingleMock })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: updateResultMock,
        })),
      })),
    })),
  }),
}));

beforeEach(() => {
  getUserMock.mockReset();
  maybeSingleMock.mockReset();
  updateResultMock.mockReset();
  updateResultMock.mockResolvedValue({ error: null });
  _resetRateLimits();
});

async function call(id: string) {
  const { POST } = await import("@/app/api/connections/[id]/resume/route");
  return POST(new Request("http://x", { method: "POST" }) as any, {
    params: Promise.resolve({ id }),
  });
}

describe("POST /api/connections/[id]/resume", () => {
  it("без авторизации → 401", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await call("c1");
    expect(res.status).toBe(401);
    expect(updateResultMock).not.toHaveBeenCalled();
  });

  it("склад не найден (или не наш) → 404", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const res = await call("c1");
    expect(res.status).toBe(404);
    expect(updateResultMock).not.toHaveBeenCalled();
  });

  it("склад не на паузе → 409", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingleMock.mockResolvedValue({ data: { id: "c1", status: "active" }, error: null });
    const res = await call("c1");
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/active/);
    expect(updateResultMock).not.toHaveBeenCalled();
  });

  it("успех: status=pending + failure_count=0", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingleMock.mockResolvedValue({ data: { id: "c1", status: "paused" }, error: null });
    const res = await call("c1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(updateResultMock).toHaveBeenCalledTimes(1);
  });

  it("DB error на SELECT → 500 без раскрытия SQL", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: "permission denied for table" } });
    const res = await call("c1");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain("permission denied");
  });
});
