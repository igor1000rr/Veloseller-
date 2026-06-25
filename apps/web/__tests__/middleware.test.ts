/**
 * @vitest-environment node
 *
 * Тесты middleware.ts — auth redirect логика.
 *
 * ВАЖНО: запускаем в node-environment, потому что jsdom ломает Headers/Request
 * (Next.js requires native Headers from undici, not jsdom polyfills).
 *
 * Проверяем 3 категории:
 *  1. Неавторизованный + приватный путь → redirect /login
 *  2. Залогиненный + /login или /register → redirect /dashboard
 *  3. Публичные пути или совпадающее состояние → пропускает
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Мокаем @supabase/ssr до импорта middleware
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(),
}));

import { createServerClient } from "@supabase/ssr";
import { middleware } from "../middleware";

const mockedCreateClient = vi.mocked(createServerClient);

function mockUser(user: { id: string } | null) {
  mockedCreateClient.mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
  } as any);
}

function makeRequest(path: string): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000${path}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
});

describe("middleware — канонизация хоста www→апекс", () => {
  // За nginx публичный хост приходит в заголовке Host (не в request.url).
  function reqWithHost(url: string, host: string): NextRequest {
    return new NextRequest(new URL(url), { headers: { host } });
  }

  it("www.veloseller.ru/dashboard → 308 на апекс, путь сохранён", async () => {
    mockUser(null);
    const res = await middleware(reqWithHost("https://www.veloseller.ru/dashboard", "www.veloseller.ru"));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://veloseller.ru/dashboard");
  });

  it("www → апекс сохраняет query-параметры", async () => {
    mockUser(null);
    const res = await middleware(reqWithHost("https://www.veloseller.ru/news?a=1&b=2", "www.veloseller.ru"));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://veloseller.ru/news?a=1&b=2");
  });

  it("www.veloseller.com → апекс того же TLD (.com)", async () => {
    mockUser(null);
    const res = await middleware(reqWithHost("https://www.veloseller.com/login", "www.veloseller.com"));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://veloseller.com/login");
  });

  it("канонизация срабатывает ДО auth — даже на публичном пути", async () => {
    mockUser({ id: "user-123" });
    const res = await middleware(reqWithHost("https://www.veloseller.ru/", "www.veloseller.ru"));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://veloseller.ru/");
  });

  it("апекс (без www) НЕ канонизируется — идёт в обычную auth-логику", async () => {
    mockUser(null);
    const res = await middleware(reqWithHost("https://veloseller.ru/dashboard", "veloseller.ru"));
    expect(res.status).toBe(307); // bounce на /login, а не 308
    expect(res.headers.get("location")).toContain("/login");
  });
});

describe("middleware — приватные пути без авторизации", () => {
  it("/dashboard → redirect /login с redirect параметром", async () => {
    mockUser(null);
    const res = await middleware(makeRequest("/dashboard"));
    expect(res.status).toBe(307);
    const loc = res.headers.get("location")!;
    expect(loc).toContain("/login");
    expect(loc).toContain("redirect=%2Fdashboard");
  });

  it("/admin → redirect /login", async () => {
    mockUser(null);
    const res = await middleware(makeRequest("/admin"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("/onboarding → redirect /login", async () => {
    mockUser(null);
    const res = await middleware(makeRequest("/onboarding"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("/connections → redirect /login", async () => {
    mockUser(null);
    const res = await middleware(makeRequest("/connections"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("/billing → redirect /login", async () => {
    mockUser(null);
    const res = await middleware(makeRequest("/billing"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("вложенный приватный путь /dashboard/skus/123 → redirect /login с правильным redirect param", async () => {
    mockUser(null);
    const res = await middleware(makeRequest("/dashboard/skus/abc-123"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("redirect=%2Fdashboard%2Fskus%2Fabc-123");
  });
});

describe("middleware — авторизованный на auth-страницах", () => {
  it("/login + user → redirect /dashboard", async () => {
    mockUser({ id: "user-123" });
    const res = await middleware(makeRequest("/login"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/dashboard");
  });

  it("/register + user → redirect /dashboard", async () => {
    mockUser({ id: "user-123" });
    const res = await middleware(makeRequest("/register"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/dashboard");
  });
});

describe("middleware — пропускает без редиректа", () => {
  it("/ публичная → пропускает любого", async () => {
    mockUser(null);
    const res = await middleware(makeRequest("/"));
    // NextResponse.next() имеет статус 200 (не redirect)
    expect(res.status).not.toBe(307);
  });

  it("/login без авторизации → пропускает (показывает форму)", async () => {
    mockUser(null);
    const res = await middleware(makeRequest("/login"));
    expect(res.status).not.toBe(307);
  });

  it("/register без авторизации → пропускает", async () => {
    mockUser(null);
    const res = await middleware(makeRequest("/register"));
    expect(res.status).not.toBe(307);
  });

  it("/dashboard + user → пропускает в dashboard", async () => {
    mockUser({ id: "user-123" });
    const res = await middleware(makeRequest("/dashboard"));
    expect(res.status).not.toBe(307);
  });

  it("/admin + user → пропускает (проверка role делается на page.tsx)", async () => {
    mockUser({ id: "user-123" });
    const res = await middleware(makeRequest("/admin"));
    expect(res.status).not.toBe(307);
  });

  it("/forgot-password — публичный, без редиректа даже для залогиненного", async () => {
    mockUser({ id: "user-123" });
    const res = await middleware(makeRequest("/forgot-password"));
    expect(res.status).not.toBe(307);
  });

  it("/api/* — не приватный путь (защищается на уровне route handler)", async () => {
    mockUser(null);
    const res = await middleware(makeRequest("/api/connections"));
    expect(res.status).not.toBe(307);
  });
});
