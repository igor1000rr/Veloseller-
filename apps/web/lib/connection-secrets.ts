/**
 * Единый источник правды по секретным ключам config подключения.
 *
 * Раньше список секретов дублировался в трёх местах (создание склада в
 * app/api/connections/route.ts, детали склада в app/api/connections/[id]/route.ts,
 * SSR-страница app/connections/[id]/page.tsx) и разъехался: Shopify `access_token`
 * не попал в маскирование деталей/SSR и уходил в ответ/HTML (в проде —
 * зашифрованным, в dev — плейнтекстом). Теперь определение одно.
 */
export const SENSITIVE_KEYS_BY_KIND: Record<string, string[]> = {
  ozon_fbo: ["client_id", "api_key"],
  ozon_fbs: ["client_id", "api_key"],
  wb_fbo:   ["token"],
  wb_fbs:   ["token"],
  shopify:  ["access_token"],
};

/**
 * Плоский набор всех секретных ключей (объединение по всем kind) + защитные
 * синонимы. Используется для маскирования там, где warehouse_kind не под рукой
 * (детали подключения, SSR-страница).
 */
export const SENSITIVE_CONFIG_KEYS: ReadonlySet<string> = new Set([
  ...Object.values(SENSITIVE_KEYS_BY_KIND).flat(),
  "password",
  "secret",
]);

export function isSensitiveConfigKey(key: string): boolean {
  return SENSITIVE_CONFIG_KEYS.has(key);
}
