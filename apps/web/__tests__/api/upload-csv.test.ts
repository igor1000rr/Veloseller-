import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
const maybeSingleMock = vi.fn();
const updateEqMock = vi.fn();
const updateMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: maybeSingleMock })) })),
      })),
      update: updateMock,
    })),
  }),
}));

beforeEach(() => {
  vi.resetAllMocks();
  process.env.WORKER_URL = "http://worker:8001";
  process.env.WORKER_SECRET = "test-secret";
  updateEqMock.mockResolvedValue({ data: null, error: null });
  updateMock.mockReturnValue({ eq: updateEqMock });
  vi.stubGlobal("fetch", vi.fn());
});

async function callUpload(file: File | null, params: { id: string }) {
  const { POST } = await import("@/app/api/connections/[id]/upload-csv/route");
  const fd = new FormData();
  if (file) fd.append("file", file);
  const req: any = { formData: async () => fd };
  return POST(req, { params: Promise.resolve(params) });
}

describe("POST /api/connections/[id]/upload-csv", () => {
  it("401 если не залогинен", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await callUpload(null, { id: "c1" });
    expect(res.status).toBe(401);
  });

  it("400 если connection не найден", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingleMock.mockResolvedValue({ data: null });
    const res = await callUpload(new File(["sku,qty\nA,1"], "data.csv"), { id: "missing" });
    expect(res.status).toBe(400);
  });

  it("400 если source != csv_upload", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingleMock.mockResolvedValue({ data: { id: "c1", source: "google_sheet", seller_id: "u1" } });
    const res = await callUpload(new File(["x"], "data.csv"), { id: "c1" });
    expect(res.status).toBe(400);
  });

  it("400 если файл не передан", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingleMock.mockResolvedValue({ data: { id: "c1", source: "csv_upload", seller_id: "u1" } });
    const res = await callUpload(null, { id: "c1" });
    expect(res.status).toBe(400);
  });

  it("happy path: пробрасывает в worker, обновляет connection, recalc", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingleMock.mockResolvedValue({ data: { id: "c1", source: "csv_upload", seller_id: "u1" } });
    const fetchMock = global.fetch as any;
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ inserted: 5 }) })
      .mockResolvedValueOnce({ ok: true });
    const res = await callUpload(new File(["sku,qty\nA,1"], "data.csv"), { id: "c1" });
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe("http://worker:8001/ingest/csv/c1");
    expect(fetchMock.mock.calls[0][1].headers["X-Worker-Secret"]).toBe("test-secret");
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      status: "active", last_error: null,
    }));
  });

  it("400 если .xlsx — просим сохранить как CSV", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingleMock.mockResolvedValue({ data: { id: "c1", source: "csv_upload", seller_id: "u1" } });
    const fetchMock = global.fetch as any;
    const res = await callUpload(new File(["PK...binary"], "book.xlsx"), { id: "c1" });
    expect(res.status).toBe(400);
    // Воркер не должен вызываться — отклоняем до него
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("если worker вернул ошибку — пробрасываем", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingleMock.mockResolvedValue({ data: { id: "c1", source: "csv_upload", seller_id: "u1" } });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false, status: 422, text: async () => "CSV parse error",
    } as any);
    const res = await callUpload(new File(["bad"], "bad.csv"), { id: "c1" });
    expect(res.status).toBe(422);
  });

  it("если recalc упал — главный ответ 200", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingleMock.mockResolvedValue({ data: { id: "c1", source: "csv_upload", seller_id: "u1" } });
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ inserted: 3 }) } as any)
      .mockRejectedValueOnce(new Error("worker down"));
    const res = await callUpload(new File(["x"], "x.csv"), { id: "c1" });
    expect(res.status).toBe(200);
  });
});
