/**
 * Safe redirect — защита от open redirect атак.
 *
 * Принимает только относительные пути. Блокирует:
 *  - Абсолютные URL (https://evil.com)
 *  - Protocol-relative URL (//evil.com)
 *  - Любые схемы (javascript:, data:, file:)
 *
 * Используется и в /login (после signIn), и в /auth/callback (после email confirm).
 */
export function safeRedirect(raw: string | null | undefined, fallback: string = "/dashboard"): string {
  if (!raw) return fallback;
  // Только относительные пути
  if (!raw.startsWith("/")) return fallback;
  // Блокируем // (protocol-relative URL: //evil.com)
  if (raw.startsWith("//")) return fallback;
  // Блокируем явные схемы (https://evil.com если каким-то образом пройдёт через первую проверку)
  if (raw.includes("://")) return fallback;
  // Блокируем javascript:, data:, etc через URL-encoded схемы
  if (/^\/[a-z]+:/i.test(raw)) return fallback;
  return raw;
}
