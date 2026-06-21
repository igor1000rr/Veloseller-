import { describe, it, expect } from "vitest";
import { safeRedirect } from "@/lib/safe-redirect";

/**
 * Тесты open-redirect гарда. Любой не-относительный путь должен схлопываться
 * в fallback — иначе /login?redirect=... превращается в редирект на чужой домен.
 */
describe("lib/safe-redirect", () => {
  it("пропускает обычный относительный путь", () => {
    expect(safeRedirect("/dashboard")).toBe("/dashboard");
    expect(safeRedirect("/connections/new")).toBe("/connections/new");
  });

  it("сохраняет query-string и hash относительного пути", () => {
    expect(safeRedirect("/dashboard/skus?q=abc")).toBe("/dashboard/skus?q=abc");
    expect(safeRedirect("/news#top")).toBe("/news#top");
  });

  it("null/undefined/'' → fallback", () => {
    expect(safeRedirect(null)).toBe("/dashboard");
    expect(safeRedirect(undefined)).toBe("/dashboard");
    expect(safeRedirect("")).toBe("/dashboard");
  });

  it("кастомный fallback", () => {
    expect(safeRedirect(null, "/login")).toBe("/login");
    expect(safeRedirect("https://evil.com", "/login")).toBe("/login");
  });

  it("абсолютный URL → fallback", () => {
    expect(safeRedirect("https://evil.com")).toBe("/dashboard");
    expect(safeRedirect("http://evil.com/path")).toBe("/dashboard");
  });

  it("protocol-relative URL (//evil.com) → fallback", () => {
    expect(safeRedirect("//evil.com")).toBe("/dashboard");
    expect(safeRedirect("//evil.com/path")).toBe("/dashboard");
  });

  it("схемы javascript:/data:/file: → fallback", () => {
    expect(safeRedirect("javascript:alert(1)")).toBe("/dashboard");
    expect(safeRedirect("data:text/html,abc")).toBe("/dashboard");
    expect(safeRedirect("file:///etc/passwd")).toBe("/dashboard");
  });

  it("относительный путь с вложенной схемой (/foo://) → fallback", () => {
    // /[a-z]+: матчит относительный путь, маскирующий схему
    expect(safeRedirect("/javascript:alert(1)")).toBe("/dashboard");
    expect(safeRedirect("/redirect://evil.com")).toBe("/dashboard");
  });

  it("путь без ведущего слэша → fallback", () => {
    expect(safeRedirect("dashboard")).toBe("/dashboard");
    expect(safeRedirect("evil.com")).toBe("/dashboard");
  });
});
