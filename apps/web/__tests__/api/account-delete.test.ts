/**
 * Критичный тест GDPR удаления аккаунта. Операция необратима,
 * поэтому все бывшие баги (пропущенный confirm, auth gap) должны иметь регресс-тесты.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { _resetRateLimits } from "@/lib/rate-limit";

const getUserMock = vi.fn();
const getSellerMock = vi.fn();
const deleteCallsByTable: Record<string, number> = {};
const deleteUserMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      if (table === "sellers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: getSellerMock })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => {
              deleteCallsByTable[table] = (deleteCallsByTable[table] || 0) + 1;
              return Promise.resolve({ error: null });
            }),
          })),
        };
      }
      // Другие таблицы — только delete/select…in
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn(() => {
            deleteCallsByTable[table] = (deleteCallsByTable[table] || 0) + 1;
            return Promise.resolve({ error: null });
          }),
          in: vi.fn(() => {
            deleteCallsByTable[table] = (deleteCallsByTable[table] || 0) + 1;
            return Promise.resolve({ error: null });
          }),
        })),
      };
    },
    auth: { admin: { deleteUser: deleteUserMock } },
  }),
}));

beforeEach(() => {
  getUserMock.mockReset();
  getSellerMock.mockReset();
  deleteUserMock.mockReset();
  for (const k of Object.keys(deleteCallsByTable)) delete deleteCallsByTable[k];
  deleteUserMock.mockResolvedValue({ error: null });
  getSellerMock.mockResolvedValue({ data: null, error: null });
  _resetRateLimits();
});

function jsonReq(body: any): Request {
  return new Request("http://x/api/account/delete", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("DELETE /api/account/delete — SECURITY", () => {
  it("без авторизации → 401, никаких удалений", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { DELETE } = await import("@/app/api/account/delete/route");
    const res = await DELETE(jsonReq({ confirm: "DELETE-MY-ACCOUNT" }) as any);
    expect(res.status).toBe(401);
    expect(deleteUserMock).not.toHaveBeenCalled();
    expect(Object.keys(deleteCallsByTable)).toEqual([]);
  });

  it("без confirm → 400", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "u@x.ru" } } });
    const { DELETE } = await import("@/app/api/account/delete/route");
    const res = await DELETE(jsonReq({}) as any);
    expect(res.status).toBe(400);
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it("с неправильным confirm → 400", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "u@x.ru" } } });
    const { DELETE } = await import("@/app/api/account/delete/route");
    const res = await DELETE(jsonReq({ confirm: "yes" }) as any);
    expect(res.status).toBe(400);
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it("без body (invalid JSON) → 400", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "u@x.ru" } } });
    const { DELETE } = await import("@/app/api/account/delete/route");
    const req = new Request("http://x", { method: "DELETE", body: "not json" });
    const res = await DELETE(req as any);
    expect(res.status).toBe(400);
  });

  it("успех: все связанные таблицы зачищены + auth.users удалён", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "u@x.ru" } } });
    const { DELETE } = await import("@/app/api/account/delete/route");
    const res = await DELETE(jsonReq({ confirm: "DELETE-MY-ACCOUNT" }) as any);
    expect(res.status).toBe(200);
    expect(deleteUserMock).toHaveBeenCalledTimes(1);
    expect(deleteUserMock).toHaveBeenCalledWith("u1");
    // Должны быть вызовы delete по ключевым таблицам
    expect(deleteCallsByTable.alerts).toBeGreaterThan(0);
    expect(deleteCallsByTable.products).toBeGreaterThan(0);
    expect(deleteCallsByTable.data_connections).toBeGreaterThan(0);
    expect(deleteCallsByTable.sellers).toBeGreaterThan(0);
  });
});
