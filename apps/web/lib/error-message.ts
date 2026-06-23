/**
 * Безопасно извлечь текст ошибки из unknown.
 *
 * Позволяет писать `catch (e)` (тип unknown под strict) вместо `catch (e: any)`:
 * достаёт message из Error ИЛИ из объекта-ошибки (PostgrestError и подобные —
 * это plain object с полем message, а НЕ instanceof Error), иначе — fallback.
 */
export function errMessage(e: unknown, fallback = "unknown error"): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return fallback;
}
