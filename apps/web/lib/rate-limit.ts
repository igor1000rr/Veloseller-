/**
 * In-memory rate limiter для API endpoints.
 *
 * Алгоритм: token bucket (sliding window). Для каждого ключа храним
 * timestamps последних запросов, выпиливая старше windowMs.
 *
 * Ограничения:
 *  - In-memory: при перезагрузке Next.js лимиты сбрасываются.
 *  - Не работает в multi-instance deployment (для этого нужен Redis/Upstash).
 *  - Для single-instance VPS (наш случай) этого достаточно.
 *
 * Для продакшен-безопасности ключ = user_id если залогинен, иначе IP.
 */

type Bucket = {
  timestamps: number[];
};

const buckets = new Map<string, Bucket>();

// Служебный cleanup — при росте словаря. Не можем использовать setInterval
// в Next.js edge — инициируем только при вызове.
function maybeCleanup() {
  if (buckets.size < 1000) return;
  const now = Date.now();
  // Удаляем бакеты, в которых нет активности больше 1 часа
  const STALE_MS = 60 * 60 * 1000;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.timestamps.length === 0 ||
        now - bucket.timestamps[bucket.timestamps.length - 1] > STALE_MS) {
      buckets.delete(key);
    }
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;  // timestamp ms когда лимит восстановится
};

export type RateLimitConfig = {
  max: number;
  windowMs: number;
};

/**
 * Проверяет и регистрирует запрос в rate limiter.
 *
 * @returns allowed=true если запрос в лимитах; remaining/resetAt для headers.
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  maybeCleanup();
  const now = Date.now();
  const windowStart = now - config.windowMs;

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }

  // Выпиливаем старые записи
  bucket.timestamps = bucket.timestamps.filter(t => t > windowStart);

  const allowed = bucket.timestamps.length < config.max;
  if (allowed) {
    bucket.timestamps.push(now);
  }

  const resetAt = bucket.timestamps.length > 0
    ? bucket.timestamps[0] + config.windowMs
    : now + config.windowMs;

  return {
    allowed,
    remaining: Math.max(0, config.max - bucket.timestamps.length),
    resetAt,
  };
}

/** Сбросить все бакеты (для тестов). */
export function _resetRateLimits() {
  buckets.clear();
}

// Предопределённые пресеты для разных endpoint'ов
export const RATE_LIMITS = {
  // Общие GET — щедрые лимиты
  READ: { max: 100, windowMs: 60_000 } as RateLimitConfig,
  // POST/DELETE/mutations — жёстче
  WRITE: { max: 30, windowMs: 60_000 } as RateLimitConfig,
  // Дорогие операции — recalc, upload
  EXPENSIVE: { max: 10, windowMs: 60_000 } as RateLimitConfig,
  // GDPR endpoints (export/delete) — очень редко
  SENSITIVE: { max: 5, windowMs: 60_000 } as RateLimitConfig,
  // Auth эндпоинты (login/register) — защита от brute force
  AUTH: { max: 10, windowMs: 60_000 } as RateLimitConfig,
  // Webhook (Robokassa Result URL и т.п.) — IP-based анти-флуд
  WEBHOOK: { max: 60, windowMs: 60_000 } as RateLimitConfig,
};

/**
 * Извлекает реальный IP клиента из запроса.
 *
 * SECURITY FIX (XFF spoofing): раньше брали первый IP из X-Forwarded-For —
 * это полностью контролируется клиентом и легко обходит rate-limit
 * (random XFF на каждый запрос → каждый «другой IP»).
 *
 * Правильный порядок при стандартной nginx-конфигурации:
 *  1. x-real-ip — nginx через proxy_set_header X-Real-IP $remote_addr;
 *     proxy_set_header перезатирает клиентский header → доверенный.
 *  2. Последний IP из X-Forwarded-For — nginx через proxy_add_x_forwarded_for
 *     ДОПИСЫВАЕТ $remote_addr в конец цепочки → последний = доверенный.
 *  3. fallback "unknown" (dev/тесты без прокси).
 */
export function getClientIp(req: Request): string {
  // 1. x-real-ip — nginx перезатирает любое клиентское значение
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    const trimmed = realIp.trim();
    if (trimmed) return trimmed;
  }
  // 2. Последний IP в X-Forwarded-For = добавлен nginx через proxy_add_x_forwarded_for
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map(s => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return "unknown";
}

/**
 * Из NextRequest извлекает ключ рейтлимита:
 *  - Предпочитает user_id из Supabase cookie (sb-...-auth-token)
 *  - Иначе IP адрес (см. getClientIp — берётся доверенный, не клиентский XFF)
 *
 * @param req NextRequest
 * @param userId optional — если уже извлекли из Supabase auth.getUser()
 */
export function getRateLimitKey(req: Request, userId?: string): string {
  if (userId) return `user:${userId}`;
  return `ip:${getClientIp(req)}`;
}

/**
 * Helper для route handlers: возвращает NextResponse с 429 если limit exceeded,
 * иначе null. Пример использования:
 *
 *   const limit = await enforceRateLimit(req, RATE_LIMITS.WRITE);
 *   if (limit) return limit;
 *   // ... основная логика
 */
export function enforceRateLimit(
  req: Request,
  config: RateLimitConfig,
  userId?: string,
): Response | null {
  const key = getRateLimitKey(req, userId);
  const result = checkRateLimit(key, config);

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    return new Response(JSON.stringify({
      error: "Rate limit exceeded",
      retryAfter,
    }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(config.max),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
      },
    });
  }

  return null;
}
