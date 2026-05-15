import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
const connSelectMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: connSelectMock })),
        })),
      })),
    })),
  }),
}));

beforeEach(() => {
  getUserMock.mockReset();
  connSelectMock.mockReset();
  global.fetch = vi.fn();
  process.env.WORKER_URL = "http://worker:8001";
  process.env.WORKER_SECRET = "secret";
});

function req() {
  return {} as any;
}

describe("POST /api/connections/[id]/sync", () => {
  it("без авторизации — 401", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { POST } = await import("@/app/api/connections/[id]/sync/route");
    const res = await POST(req(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(401);
  });

  it("если connection не найдена — 404", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    connSelectMock.mockResolvedValue({ data: null });
    const { POST } = await import("@/app/api/connections/[id]/sync/route");
    const res = await POST(req(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(404);
  });

  it("google_sheet -> /ingest/google-sheet/{id}", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    connSelectMock.mockResolvedValue({ data: { id: "c1", source: "google_sheet", seller_id: "u1" } });
    (global.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ inserted: 5 }) });
    (global.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const { POST } = await import("@/app/api/connections/[id]/sync/route");
    const res = await POST(req(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(200);
    expect((global.fetch as any).mock.calls[0][0]).toBe("http://worker:8001/ingest/google-sheet/c1");
  });

  it("marketplace_api+ozon -> /ingest/ozon/{id}", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    connSelectMock.mockResolvedValue({ data: { id: "c1", source: "marketplace_api", marketplace: "ozon", seller_id: "u1" } });
    (global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ inserted: 10 }) });
    const { POST } = await import("@/app/api/connections/[id]/sync/route");
    await POST(req(), { params: Promise.resolve({ id: "c1" }) });
    expect((global.fetch as any).mock.calls[0][0]).toBe("http://worker:8001/ingest/ozon/c1");
  });

  it("marketplace_api+wildberries -> /ingest/wb/{id}", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    connSelectMock.mockResolvedValue({ data: { id: "c1", source: "marketplace_api", marketplace: "wildberries", seller_id: "u1" } });
    (global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ inserted: 7 }) });
    const { POST } = await import("@/app/api/connections/[id]/sync/route");
    await POST(req(), { params: Promise.resolve({ id: "c1" }) });
    expect((global.fetch as any).mock.calls[0][0]).toBe("http://worker:8001/ingest/wb/c1");
  });

  it("csv_upload — 400 (только через upload-csv)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    connSelectMock.mockResolvedValue({ data: { id: "c1", source: "csv_upload", seller_id: "u1" } });
    const { POST } = await import("@/app/api/connections/[id]/sync/route");
    const res = await POST(req(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(400);
  });

  it("если worker вернул не-ok — статус + error", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    connSelectMock.mockResolvedValue({ data: { id: "c1", source: "google_sheet", seller_id: "u1" } });
    (global.fetch as any).mockResolvedValueOnce({ ok: false, status: 500, text: async () => "boom" });
    const { POST } = await import("@/app/api/connections/[id]/sync/route");
    const res = await POST(req(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("boom");
  });
});
