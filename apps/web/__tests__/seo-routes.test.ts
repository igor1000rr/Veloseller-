/**
 * Гварды целостности SEO-роутов sitemap.ts / robots.ts (CI, без сети).
 *
 * E2E против живого хоста бьёт sitemap/robots по HTTP (post-deploy job), но не
 * проверяет СОДЕРЖАНИЕ. Здесь — юнит-инварианты на чистых функциях-генераторах:
 * ключевые публичные страницы на месте, приватные/noindex НЕ утекают (краул-бюджет
 * + «Submitted URL marked noindex» в GSC), и sitemap не противоречит robots.
 */
import { describe, it, expect } from "vitest";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { posts } from "@/lib/news/posts";
import { SITE_URL } from "@/lib/features";

function robotsRule() {
  const r = robots();
  const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
  const disallow = ([] as string[]).concat(rule?.disallow ?? []);
  return { rule, disallow, sitemap: r.sitemap };
}

describe("sitemap.ts", () => {
  const entries = sitemap();
  const urls = entries.map((e) => String(e.url));

  it("включает ключевые публичные страницы", () => {
    for (const path of ["", "/news", "/partner", "/privacy", "/terms"]) {
      expect(urls).toContain(`${SITE_URL}${path}`);
    }
  });

  it("включает все гайды /news/<slug> — по записи на пост, без потерь", () => {
    for (const p of posts) {
      expect(urls).toContain(`${SITE_URL}/news/${p.slug}`);
    }
    const newsUrls = urls.filter((u) => u.startsWith(`${SITE_URL}/news/`));
    expect(newsUrls).toHaveLength(posts.length);
  });

  it("все URL абсолютные и под SITE_URL", () => {
    for (const u of urls) expect(u.startsWith(SITE_URL)).toBe(true);
  });

  it("без дублей URL", () => {
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("priority в (0..1], changeFrequency задан", () => {
    for (const e of entries) {
      if (e.priority !== undefined) {
        expect(e.priority).toBeGreaterThan(0);
        expect(e.priority).toBeLessThanOrEqual(1);
      }
      expect(e.changeFrequency).toBeTruthy();
    }
  });

  it("НЕ содержит приватных/noindex страниц", () => {
    const forbidden = [
      "/login", "/register", "/forgot-password", "/reset-password",
      "/dashboard", "/admin", "/billing", "/account", "/onboarding",
      "/connections", "/auth",
    ];
    for (const u of urls) {
      const path = u.slice(SITE_URL.length); // "" для главной
      for (const f of forbidden) {
        expect(path === f || path.startsWith(f + "/")).toBe(false);
      }
    }
  });
});

describe("robots.ts", () => {
  it("разрешает корень и закрывает приватные префиксы", () => {
    const { rule, disallow } = robotsRule();
    expect(rule?.allow).toBe("/");
    for (const p of ["/api/", "/dashboard/", "/admin/", "/account/", "/billing/", "/onboarding/", "/connections/", "/auth/"]) {
      expect(disallow).toContain(p);
    }
  });

  it("указывает на sitemap.xml под SITE_URL", () => {
    expect(robotsRule().sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});

describe("консистентность sitemap ↔ robots", () => {
  it("ни один URL из sitemap не попадает под disallow robots", () => {
    const { disallow } = robotsRule();
    for (const e of sitemap()) {
      const path = String(e.url).slice(SITE_URL.length) || "/";
      for (const d of disallow) {
        expect(path.startsWith(d)).toBe(false);
      }
    }
  });
});
