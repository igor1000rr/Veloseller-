/**
 * Unit-тесты для in-memory rate limiter.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  checkRateLimit,
  enforceRateLimit,
  getClientIp,
  getRateLimitKey,
  _resetRateLimits,
  RATE_LIMITS,
} from "../../lib/rate-limit";

beforeEach(() => {
  _resetRateLimits();
});

describe("checkRateLimit", () => {
  it("пропускает запросы в лимите", () => {
    const config = { max: 3, windowMs: 1000 };
    expect(checkRateLimit("k1", config).allowed).toBe(true);
    expect(checkRateLimit("k1", config).allowed).toBe(true);
    expect(checkRateLimit("k1", config).allowed).toBe(true);
  });

  it("блокирует превышение лимита", () => {
    const config = { max: 2, windowMs: 1000 };
    checkRateLimit("k2", config);
    checkRateLimit("k2", config);
    const result = checkRateLimit("k2", config);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("возвращает правильный remaining при каждом вызове", () => {
    const config = { max: 3, windowMs: 1000 };
    expect(checkRateLimit("k3", config).remaining).toBe(2);
    expect(checkRateLimit("k3", config).remaining).toBe(1);
    expect(checkRateLimit("k3", config).remaining).toBe(0);
    expect(checkRateLimit("k3", config).allowed).toBe(false);
  });

  it("лимиты изолированы по ключам", () => {
    const config = { max: 1, windowMs: 1000 };
    expect(checkRateLimit("alice", config).allowed).toBe(true);
    expect(checkRateLimit("bob", config).allowed).toBe(true);
    expect(checkRateLimit("alice", config).allowed).toBe(false);
    expect(checkRateLimit("bob", config).allowed).toBe(false);
  });

  it("сбрасывает лимит после windowMs (с fake timers)", () => {
    vi.useFakeTimers();
    const config = { max: 1, windowMs: 1000 };
    expect(checkRateLimit("k4", config).allowed).toBe(true);
    expect(checkRateLimit("k4", config).allowed).toBe(false);
    // Прыгаем вперёд на 1001ms
    vi.advanceTimersByTime(1001);
    expect(checkRateLimit("k4", config).allowed).toBe(true);
    vi.useRealTimers();
  });

  it("resetAt возвращает корректный timestamp", () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    const config = { max: 2, windowMs: 5000 };
    const r = checkRateLimit("k5", config);
    // Первый timestamp = now → resetAt = now + 5000
    expect(r.resetAt).toBe(now + 5000);
    vi.useRealTimers();
  });
});

describe("getClientIp", () => {
  // SECURITY FIX (XFF spoofing): взятие ПЕРВОГО IP из X-Forwarded-For было
  // уязвимостью — это пользовательское значение, легко обходит rate-limit.
  // Нужно брать ПОСЛЕДНИЙ (добавлен nginx через proxy_add_x_forwarded_for)
  // или x-real-ip (жёстко перезаписывается nginx в sites-enabled/veloseller).

  it("берёт последний IP из X-Forwarded-For (добавлен nginx, доверенный)", () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.10.11.12" },
    });
    expect(getClientIp(req)).toBe("9.10.11.12");
  });

  it("x-real-ip имеет приоритет над X-Forwarded-For", () => {
    // Приоритет x-real-ip — это nginx proxy_set_header X-Real-IP $remote_addr,
    // который ПЕРЕЗАПИСЫВАЕТ любое клиентское значение (в отличие от add_x_forwarded_for).
    const req = new Request("http://x", {
      headers: {
        "x-real-ip": "5.5.5.5",
        "x-forwarded-for": "1.2.3.4, 9.9.9.9",
      },
    });
    expect(getClientIp(req)).toBe("5.5.5.5");
  });

  it("fallback на X-Real-IP если нет XFF", () => {
    const req = new Request("http://x", {
      headers: { "x-real-ip": "5.5.5.5" },
    });
    expect(getClientIp(req)).toBe("5.5.5.5");
  });

  it("возвращает 'unknown' без headers", () => {
    const req = new Request("http://x");
    expect(getClientIp(req)).toBe("unknown");
  });

  it("trim пробелы вокруг последнего IP", () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "  1.2.3.4  ,  5.6.7.8  " },
    });
    expect(getClientIp(req)).toBe("5.6.7.8");
  });

  it("один IP в XFF — возвращает его же", () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });
});

describe("getRateLimitKey", () => {
  it("предпочитает user_id если есть", () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    expect(getRateLimitKey(req, "user-uuid-123")).toBe("user:user-uuid-123");
  });

  it("fallback на IP если user_id нет", () => {
    // Один IP в XFF = он же последний = выбранный.
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    expect(getRateLimitKey(req)).toBe("ip:1.2.3.4");
  });
});

describe("enforceRateLimit", () => {
  it("возвращает null если в лимите", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.1.1.1" } });
    const result = enforceRateLimit(req, { max: 5, windowMs: 1000 });
    expect(result).toBeNull();
  });

  it("возвращает 429 Response при превышении", async () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "2.2.2.2" } });
    const config = { max: 1, windowMs: 1000 };
    enforceRateLimit(req, config);  // первый — проходит
    const result = enforceRateLimit(req, config);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
    expect(result!.headers.get("retry-after")).toBeTruthy();
    expect(result!.headers.get("x-ratelimit-limit")).toBe("1");
    expect(result!.headers.get("x-ratelimit-remaining")).toBe("0");
    const body = await result!.json();
    expect(body.error).toBe("Rate limit exceeded");
    expect(body.retryAfter).toBeGreaterThan(0);
  });

  it("различает user vs IP в ключах", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "3.3.3.3" } });
    const config = { max: 1, windowMs: 1000 };
    // Первый — без user_id (ключ = ip:3.3.3.3)
    expect(enforceRateLimit(req, config)).toBeNull();
    // Второй — с user_id (другой ключ = user:abc)
    expect(enforceRateLimit(req, config, "abc")).toBeNull();
    // Третий — снова без user_id (ключ ip:3.3.3.3 уже исчерпан)
    expect(enforceRateLimit(req, config)).not.toBeNull();
  });
});

describe("RATE_LIMITS пресеты", () => {
  it("имеют соответствующую строгость", () => {
    // READ более либеральный чем WRITE
    expect(RATE_LIMITS.READ.max).toBeGreaterThan(RATE_LIMITS.WRITE.max);
    // WRITE более либеральный чем EXPENSIVE
    expect(RATE_LIMITS.WRITE.max).toBeGreaterThan(RATE_LIMITS.EXPENSIVE.max);
    // EXPENSIVE более либеральный чем SENSITIVE
    expect(RATE_LIMITS.EXPENSIVE.max).toBeGreaterThan(RATE_LIMITS.SENSITIVE.max);
    // WEBHOOK — IP-based, умеренный, больше WRITE (внешние вызовы платёжной системы)
    expect(RATE_LIMITS.WEBHOOK.max).toBeGreaterThanOrEqual(RATE_LIMITS.WRITE.max);
    // Все окна = 1 минута
    expect(RATE_LIMITS.READ.windowMs).toBe(60_000);
    expect(RATE_LIMITS.WRITE.windowMs).toBe(60_000);
    expect(RATE_LIMITS.WEBHOOK.windowMs).toBe(60_000);
  });
});
