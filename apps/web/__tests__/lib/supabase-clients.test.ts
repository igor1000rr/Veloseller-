import { describe, it, expect, vi, beforeEach } from "vitest";

const createBrowserClientMock = vi.fn();
const createServerClientMock = vi.fn();
const cookiesMock = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: createBrowserClientMock,
  createServerClient: createServerClientMock,
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

beforeEach(() => {
  vi.resetAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";
});

describe("lib/supabase/client (browser)", () => {
  it("createSupabaseBrowserClient зовёт createBrowserClient с url + anon key", async () => {
    createBrowserClientMock.mockReturnValue({ auth: {} });
    const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
    createSupabaseBrowserClient();
    expect(createBrowserClientMock).toHaveBeenCalledWith("https://test.supabase.co", "anon-test-key");
  });
});

describe("lib/supabase/server (SSR)", () => {
  it("createSupabaseServerClient читает cookies() и пробрасывает в createServerClient", async () => {
    const getAllMock = vi.fn().mockReturnValue([{ name: "sb-auth", value: "x" }]);
    const setMock = vi.fn();
    cookiesMock.mockResolvedValue({ getAll: getAllMock, set: setMock });
    createServerClientMock.mockReturnValue({ auth: {} });

    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    await createSupabaseServerClient();

    expect(createServerClientMock).toHaveBeenCalledWith(
      "https://test.supabase.co", "anon-test-key",
      expect.objectContaining({
        cookies: expect.objectContaining({
          getAll: expect.any(Function),
          setAll: expect.any(Function),
        }),
      }),
    );
    const config = createServerClientMock.mock.calls[0][2];
    expect(config.cookies.getAll()).toEqual([{ name: "sb-auth", value: "x" }]);
    expect(getAllMock).toHaveBeenCalled();
  });

  it("setAll — корректно вызывает cookieStore.set", async () => {
    const setMock = vi.fn();
    cookiesMock.mockResolvedValue({ getAll: vi.fn().mockReturnValue([]), set: setMock });
    createServerClientMock.mockReturnValue({});

    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    await createSupabaseServerClient();

    const config = createServerClientMock.mock.calls[0][2];
    config.cookies.setAll([
      { name: "sb-a", value: "v1", options: { secure: true } },
      { name: "sb-b", value: "v2", options: {} },
    ]);
    expect(setMock).toHaveBeenCalledTimes(2);
    expect(setMock).toHaveBeenCalledWith("sb-a", "v1", { secure: true });
    expect(setMock).toHaveBeenCalledWith("sb-b", "v2", {});
  });

  it("setAll в RSC-контексте (cookieStore.set бросает) — не падает", async () => {
    cookiesMock.mockResolvedValue({
      getAll: vi.fn().mockReturnValue([]),
      set: vi.fn().mockImplementation(() => { throw new Error("Cookies can only be modified in Server Action"); }),
    });
    createServerClientMock.mockReturnValue({});

    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    await createSupabaseServerClient();

    const config = createServerClientMock.mock.calls[0][2];
    expect(() => config.cookies.setAll([{ name: "x", value: "y", options: {} }])).not.toThrow();
  });
});
