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
        return { eq: vi.fn(() => ({ eq: updateChainMock })) };
      }),
    })),
  }),
}));

beforeEach(() => {
  getUserMock.mockReset();
  updateChainMock.mockReset();
  capturedUpdate = null;
});

function makeReq(body: any) {
  return new Request("http://x", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

describe("PATCH /api/products/[id]/reorder", () => {
  it("без авторизации — 401", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { PATCH } = await import("@/app/api/products/[id]/reorder/route");
    const res = await PATCH(makeReq({}), { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(401);
  });

  it("валидные значения обновляются", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    updateChainMock.mockResolvedValue({ error: null });
    const { PATCH } = await import("@/app/api/products/[id]/reorder/route");
    const res = await PATCH(makeReq({ lead_time_days: 14, safety_days: 7 }), { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(200);
    expect(capturedUpdate).toEqual({ lead_time_days: 14, safety_days: 7 });
  });

  it("значения вне 0-365 игнорируются", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    updateChainMock.mockResolvedValue({ error: null });
    const { PATCH } = await import("@/app/api/products/[id]/reorder/route");
    await PATCH(makeReq({ lead_time_days: 400, safety_days: -1 }), { params: Promise.resolve({ id: "p1" }) });
    expect(capturedUpdate).toEqual({});
  });

  it("null/empty сохраняют null", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    updateChainMock.mockResolvedValue({ error: null });
    const { PATCH } = await import("@/app/api/products/[id]/reorder/route");
    await PATCH(makeReq({ lead_time_days: null, safety_days: "" }), { params: Promise.resolve({ id: "p1" }) });
    expect(capturedUpdate).toEqual({ lead_time_days: null, safety_days: null });
  });

  it("нечисловой ввод игнорируется", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    updateChainMock.mockResolvedValue({ error: null });
    const { PATCH } = await import("@/app/api/products/[id]/reorder/route");
    await PATCH(makeReq({ lead_time_days: "abc" }), { params: Promise.resolve({ id: "p1" }) });
    expect(capturedUpdate).toEqual({});
  });

  it("при ошибке БД — 400", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    updateChainMock.mockResolvedValue({ error: { message: "rls violation" } });
    const { PATCH } = await import("@/app/api/products/[id]/reorder/route");
    const res = await PATCH(makeReq({ lead_time_days: 7 }), { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(400);
  });

  it("невалидный JSON в body — пустой update", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    updateChainMock.mockResolvedValue({ error: null });
    const req = new Request("http://x", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "not-json" });
    const { PATCH } = await import("@/app/api/products/[id]/reorder/route");
    const res = await PATCH(req, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(200);
    expect(capturedUpdate).toEqual({});
  });
});
