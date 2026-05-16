/**
 * @vitest-environment node
 *
 * Smoke E2E тесты против production-хоста (или staging).
 * Не требуют браузера, работают только с HTTP.
 *
 * Запуск:
 *   E2E_BASE_URL=https://veloseller.com npm run test:e2e
 *
 * Без E2E_BASE_URL тесты пропускаются (в CI не запускаются).
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

  it("/api/account/export без auth = 401", async () => {
    const r = await fetch(`${BASE}/api/account/export`);
    expect(r.status).toBe(401);
  });

  it("/api/account/delete без auth = 401", async () => {
    const r = await fetch(`${BASE}/api/account/delete`, { method: "DELETE" });
    expect(r.status).toBe(401);
  });

  it("security headers (HTTPS-only)", async () => {
    if (!BASE!.startsWith("https://")) return;
    const r = await fetch(BASE!);
    // Hint: эти хедеры должен выставлять nginx (см. nginx-secure.conf)
    const xfo = r.headers.get("x-frame-options");
    const xcto = r.headers.get("x-content-type-options");
    // Не обязательные — но желательные. Просто логируем.
    console.log("  X-Frame-Options:", xfo || "(missing)");
    console.log("  X-Content-Type-Options:", xcto || "(missing)");
  });
});
