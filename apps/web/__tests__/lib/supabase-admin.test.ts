import { describe, it, expect, beforeEach, vi } from "vitest";

const createClientMock = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));

const originalEnv = { ...process.env };
beforeEach(() => {
  createClientMock.mockReset();
  process.env = { ...originalEnv };
});

describe("lib/supabase/admin", () => {
  it("выбрасывает без NEXT_PUBLIC_SUPABASE_URL", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    expect(() => createSupabaseAdminClient()).toThrow(/Admin client требует/);
  });

  it("выбрасывает без SUPABASE_SERVICE_ROLE_KEY", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    expect(() => createSupabaseAdminClient()).toThrow();
  });

  it("создаёт клиент с persistSession:false (RLS bypass)", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    createClientMock.mockReturnValue({ from: vi.fn() });
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    createSupabaseAdminClient();
    expect(createClientMock).toHaveBeenCalledWith(
      "http://localhost", "service-key",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  });
});
