/**
 * Защита от open redirect — принимаем только относительные пути.
 *
 * Блокируем:
 *   - https://evil.com, http://evil.com (полные URL)
 *   - //evil.com (protocol-relative URL)
 *   - /path с javascript:, data:, vbscript: схемами после слэша
 *   - всё, что не начинается с /
 *
 * Используется в /login (?redirect=) и /auth/callback (?next=).
 */
export function safeRedirect(
  raw: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!raw) return fallback;
  // Только относительные пути
  if (!raw.startsWith("/")) return fallback;
  // Блокируем // (protocol-relative URL: //evil.com)
  if (raw.startsWith("//")) return fallback;
  // Блокируем явные схемы (https://, http://)
  if (raw.includes("://")) return fallback;
  // Блокируем javascript:, data:, etc через URL-encoded схемы вида /something:
  if (/^\/[a-z]+:/i.test(raw)) return fallback;
  return raw;
}
