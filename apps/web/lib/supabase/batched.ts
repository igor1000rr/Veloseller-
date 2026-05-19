/**
 * Утилиты для безопасной работы с большими массивами в Supabase queries.
 *
 * PostgREST имеет лимит длины URL ~8KB. При .in("col", values) значения
 * передаются через URL query string. Если массив большой (например 1879 SKU
 * по 12 символов = ~22KB), запрос обрезается и часть данных не приходит.
 *
 * Эти хелперы решают проблему батчингом.
 */

// Безопасный размер батча. UUID 36 chars × 200 = 7.2KB URL → безопасно.
// Короткие строки можно батчить по 500. Берём минимум для общего случая.
const DEFAULT_BATCH = 200;

/**
 * Выполняет .in() запрос с батчингом. Возвращает все строки из всех батчей.
 *
 * @param buildQuery — функция, принимающая батч значений и возвращающая Supabase query.
 *                    Должна возвращать PromiseLike<{ data: any[] | null, error: any }>.
 * @param values — все значения для .in() (обычно >200 элементов).
 * @param batchSize — размер батча (по умолчанию 200).
 */
export async function batchedIn<T = any>(
  buildQuery: (batch: any[]) => PromiseLike<{ data: T[] | null; error: any }>,
  values: any[],
  batchSize: number = DEFAULT_BATCH,
): Promise<T[]> {
  if (!values.length) return [];
  const out: T[] = [];
  for (let i = 0; i < values.length; i += batchSize) {
    const batch = values.slice(i, i + batchSize);
    const { data, error } = await buildQuery(batch);
    if (error) throw error;
    if (data && data.length) out.push(...data);
  }
  return out;
}

/**
 * Выполняет DELETE с .in() через батчинг. Возвращает количество удалённых строк
 * (если admin вернул count, иначе суммирует длины data).
 */
export async function batchedInDelete(
  buildQuery: (batch: any[]) => PromiseLike<{ data: any[] | null; error: any; count?: number | null }>,
  values: any[],
  batchSize: number = DEFAULT_BATCH,
): Promise<number> {
  if (!values.length) return 0;
  let total = 0;
  for (let i = 0; i < values.length; i += batchSize) {
    const batch = values.slice(i, i + batchSize);
    const { data, error, count } = await buildQuery(batch);
    if (error) throw error;
    total += count ?? data?.length ?? 0;
  }
  return total;
}
