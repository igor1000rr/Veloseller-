/**
 * GET /api/account/export — GDPR Article 20 (data portability).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { _resetRateLimits } from "@/lib/rate-limit";

const getUserMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (_table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => Promise.resolve({ data: [], error: null })),
        maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        then: (resolve: any) => resolve({ data: [], error: null }),
      };
      return chain;
    },
  }),
}));

vi.mock("@/lib/supabase/batched", () => ({
  batchedIn: async () => [],
}));

beforeEach(() => {
  getUserMock.mockReset();
  _resetRateLimits();
});

describe("GET /api/account/export", () => {
  it("без авторизации → 401", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { GET } = await import("@/app/api/account/export/route");
    const res = await GET(new Request("http://x") as any);
    expect(res.status).toBe(401);
  });

  it("успех: возвращает JSON с Content-Disposition attachment", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "u@x.ru" } } });
    const { GET } = await import("@/app/api/account/export/route");
    const res = await GET(new Request("http://x") as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="veloseller-export-u1-/);
    const body = JSON.parse(await res.text());
    expect(body.export_meta.gdpr_article).toMatch(/Article 20/);
    expect(body.export_meta.user_id).toBe("u1");
    expect(body.export_meta.email).toBe("u@x.ru");
    // API ключи НЕ должны попадать в экспорт
    expect(body.note).toMatch(/API-ключи маркетплейсов исключены/);
  });
});
