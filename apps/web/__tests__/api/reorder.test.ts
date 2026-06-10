import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
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
        return { eq: vi.fn(() => ({ eq: updateChainMock })) };
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

function makeReq(body: any) {
  return new NextRequest("http://x", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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
    updateChainMock.mockResolvedValue({ error: null, count: 1 });
    const { PATCH } = await import("@/app/api/products/[id]/reorder/route");
    const res = await PATCH(makeReq({ lead_time_days: 14, safety_days: 7 }), { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(200);
    expect(capturedUpdate).toEqual({ lead_time_days: 14, safety_days: 7 });
  });

  it("значения вне 0-365 игнорируются, пустой update — 400", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { PATCH } = await import("@/app/api/products/[id]/reorder/route");
    const res = await PATCH(makeReq({ lead_time_days: 400, safety_days: -1 }), { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(400);
  });

  it("null/empty сохраняют null", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    updateChainMock.mockResolvedValue({ error: null, count: 1 });
    const { PATCH } = await import("@/app/api/products/[id]/reorder/route");
    await PATCH(makeReq({ lead_time_days: null, safety_days: "" }), { params: Promise.resolve({ id: "p1" }) });
    expect(capturedUpdate).toEqual({ lead_time_days: null, safety_days: null });
  });

  it("нечисловой ввод — пустой update — 400", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { PATCH } = await import("@/app/api/products/[id]/reorder/route");
    const res = await PATCH(makeReq({ lead_time_days: "abc" }), { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(400);
  });

  it("при ошибке БД — 500", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    updateChainMock.mockResolvedValue({ error: { message: "rls violation" }, count: null });
    const { PATCH } = await import("@/app/api/products/[id]/reorder/route");
    const res = await PATCH(makeReq({ lead_time_days: 7 }), { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(500);
  });

  it("невалидный JSON в body — пустой update — 400", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const req = new NextRequest("http://x", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "not-json" });
    const { PATCH } = await import("@/app/api/products/[id]/reorder/route");
    const res = await PATCH(req, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(400);
  });

  it("product не найден — 404", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    updateChainMock.mockResolvedValue({ error: null, count: 0 });
    const { PATCH } = await import("@/app/api/products/[id]/reorder/route");
    const res = await PATCH(makeReq({ lead_time_days: 7 }), { params: Promise.resolve({ id: "other-user-product" }) });
    expect(res.status).toBe(404);
  });
});
