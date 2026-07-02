import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
const maybeSingleMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: maybeSingleMock })) })),
      })),
    })),
  }),
}));

beforeEach(() => {
  vi.resetAllMocks();
  process.env.WORKER_URL = "http://worker:8001";
  process.env.WORKER_SECRET = "test-secret";
  vi.stubGlobal("fetch", vi.fn());
});

async function callManual(body: any, params: { id: string }) {
  const { POST } = await import("@/app/api/connections/[id]/manual/route");
  const req: any = { json: async () => body };
  return POST(req, { params: Promise.resolve(params) });
}

describe("POST /api/connections/[id]/manual", () => {
  it("401 если не залогинен", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await callManual({ items: [] }, { id: "c1" });
    expect(res.status).toBe(401);
  });

  it("400 если source != manual", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingleMock.mockResolvedValue({ data: { id: "c1", source: "csv_upload", seller_id: "u1" } });
    const res = await callManual({ items: [{ sku: "A", stock_quantity: 1, price: 10 }] }, { id: "c1" });
    expect(res.status).toBe(400);
  });

  it("400 если items пуст", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingleMock.mockResolvedValue({ data: { id: "c1", source: "manual", seller_id: "u1" } });
    const res = await callManual({ items: [] }, { id: "c1" });
    expect(res.status).toBe(400);
  });

  it("happy path: пробрасывает в worker /ingest/manual/[id]", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingleMock.mockResolvedValue({ data: { id: "c1", source: "manual", seller_id: "u1" } });
    const fetchMock = global.fetch as any;
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, inserted: 1 }) })
      .mockResolvedValueOnce({ ok: true });
    const res = await callManual(
      { items: [{ sku: "A1", product_name: "T", stock_quantity: 7, price: 99.9 }] },
      { id: "c1" },
    );
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe("http://worker:8001/ingest/manual/c1");
    expect(fetchMock.mock.calls[0][1].headers["X-Worker-Secret"]).toBe("test-secret");
  });
});
