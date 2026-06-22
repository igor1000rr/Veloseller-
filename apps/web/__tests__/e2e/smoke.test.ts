/**
 * @vitest-environment node
 *
 * Smoke E2E тесты против production-хоста (или staging).
 * Не требуют браузера, работают только с HTTP.
 *
 * Запуск:
 *   E2E_BASE_URL=https://veloseller.ru npm run test:e2e
 *
 * Без E2E_BASE_URL тесты пропускаются (в обычном CI не запускаются; гоняются
 * отдельным job'ом после деплоя — см. .github/workflows/deploy.yml).
 */
import { describe, it, expect } from "vitest";

const BASE = process.env.E2E_BASE_URL;
const describeOrSkip = BASE ? describe : describe.skip;

describeOrSkip("E2E smoke (против " + BASE + ")", () => {
  it("главная страница отвечает 200", async () => {
    const r = await fetch(BASE!);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain("Veloseller");
  });

  it("/privacy отдаёт страницу", async () => {
    const r = await fetch(`${BASE}/privacy`);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain("Политика конфиденциальности");
  });

  it("/terms отдаёт страницу", async () => {
    const r = await fetch(`${BASE}/terms`);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain("Условия использования");
  });

  it("/login возвращает форму (не редирект)", async () => {
    const r = await fetch(`${BASE}/login`, { redirect: "manual" });
    expect([200, 304]).toContain(r.status);
  });

  it("/register возвращает форму", async () => {
    const r = await fetch(`${BASE}/register`, { redirect: "manual" });
    expect([200, 304]).toContain(r.status);
  });

  it("/news (SEO-индекс) отвечает 200", async () => {
    const r = await fetch(`${BASE}/news`);
    expect(r.status).toBe(200);
  });

  it("/dashboard без auth редиректит на /login", async () => {
    const r = await fetch(`${BASE}/dashboard`, { redirect: "manual" });
    expect([302, 307]).toContain(r.status);
    const loc = r.headers.get("location");
    expect(loc).toContain("/login");
  });

  it("/api/health возвращает status", async () => {
    const r = await fetch(`${BASE}/api/health`);
    expect([200, 503]).toContain(r.status);
    const body = await r.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("checks");
  });

  // ── auth-gap: чувствительные API без сессии = 401 ───────────────────────────
  // Только GET/DELETE-эндпоинты с реальной auth-проверкой. /api/connections и
  // /api/notifications сюда НЕ входят: у них нет GET-обработчика → 405 (метод
  // отсекается раньше auth), что отдельный e2e-прогон и выявил.
  it.each([
    ["/api/account/export", "GET"],
    ["/api/account/delete", "DELETE"],
  ])("%s без auth = 401", async (path, method) => {
    const r = await fetch(`${BASE}${path}`, { method, redirect: "manual" });
    expect(r.status).toBe(401);
  });

  // ── CSP: раздельный enforce (валидирует middleware.ts) ──────────────────────
  it("CSP на публичной странице — enforce, мягкий, без nonce", async () => {
    const r = await fetch(`${BASE}/news`, { redirect: "manual" });
    const csp = r.headers.get("content-security-policy");
    expect(csp).toBeTruthy();                                  // enforce…
    expect(r.headers.get("content-security-policy-report-only")).toBeNull(); // …не report-only
    expect(csp).toContain("'unsafe-inline'");                  // статика: inline разрешён
    expect(csp).not.toContain("'nonce-");                      // без nonce (prerender)
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("form-action 'self' https://auth.robokassa.ru");
  });

  it("CSP на app-роуте — строгий nonce + strict-dynamic", async () => {
    // /dashboard без auth → 307 на /login, но строгий CSP-заголовок уже стоит
    const r = await fetch(`${BASE}/dashboard`, { redirect: "manual" });
    const csp = r.headers.get("content-security-policy");
    expect(csp).toBeTruthy();
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);            // per-request nonce
  });

  it("nonce на app-роуте уникален на каждый запрос", async () => {
    const grab = async () =>
      (await fetch(`${BASE}/dashboard`, { redirect: "manual" }))
        .headers.get("content-security-policy")
        ?.match(/'nonce-([A-Za-z0-9+/=]+)'/)?.[1];
    const [a, b] = await Promise.all([grab(), grab()]);
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });

  // ── security-заголовки (реальные ассерты) ───────────────────────────────────
  // toContain, а не toBe: nginx и next.config иногда шлют один заголовок оба →
  // значение задваивается ('nosniff, nosniff'). Безвредно (значение то же), но
  // строгий toBe бы падал. Дубль — кандидат на чистку (proxy_hide_header в nginx).
  it("security headers выставлены", async () => {
    const r = await fetch(BASE!, { redirect: "manual" });
    expect(r.headers.get("x-content-type-options") || "").toContain("nosniff");
    expect((r.headers.get("x-frame-options") || "").toUpperCase()).toContain("SAMEORIGIN");
    expect(r.headers.get("referrer-policy")).toBeTruthy();
    if (BASE!.startsWith("https://")) {
      expect(r.headers.get("strict-transport-security") || "").toContain("max-age=");
    }
  });
});
