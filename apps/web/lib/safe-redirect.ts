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
  // Backslash: WHATWG URL трактует \ как / — "/\evil.com" нормализуется в
  // "//evil.com" и уводит на чужой ориджин (так делают и new URL(), и браузер
  // в заголовке Location). Поэтому любой backslash → fallback.
  if (raw.includes("\\")) return fallback;
  // Блокируем явные схемы (https://evil.com если каким-то образом пройдёт через первую проверку)
  if (raw.includes("://")) return fallback;
  // Блокируем javascript:, data:, etc через URL-encoded схемы
  if (/^\/[a-z]+:/i.test(raw)) return fallback;
  // Позитивная валидация: путь, разрешённый относительно произвольного ориджина,
  // не должен этот ориджин менять. Ловит экзотические обходы (управляющие
  // символы, которые парсер URL вырезает, и пр.).
  try {
    const base = "https://veloseller.invalid";
    if (new URL(raw, base).origin !== base) return fallback;
  } catch {
    return fallback;
  }
  return raw;
}
