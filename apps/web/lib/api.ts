/**
 * Единая точка вызова Python worker'а из Next.js API-роутов.
 *
 * Зачем: раньше каждый роут сам читал WORKER_URL/WORKER_SECRET, валидировал их,
 * делал fetch с AbortController-таймаутом и руками обрезал текст ошибки. Логика
 * расползлась по 8 файлам и расходилась в деталях. Здесь — один источник правды.
 *
 * Контракт сохранён 1:1 с прежними роутами:
 *   - заголовок авторизации воркера — { "X-Worker-Secret": <secret> };
 *   - таймаут реализован через AbortController (а не AbortSignal.timeout),
 *     чтобы AbortError можно было отличить от прочих сетевых ошибок;
 *   - текст ошибки воркера обрезается до 500 байт (без раскрытия stacktrace).
 */

/** Заголовок-секрет для аутентификации запросов web → worker. */
export const WORKER_SECRET_HEADER = "X-Worker-Secret";

/** Сколько байт текста ошибки воркера пробрасываем в UI (остальное — мусор/stacktrace). */
const WORKER_ERROR_MAX_BYTES = 500;

/** Конфиг воркера из ENV. */
export type WorkerConfig = { url: string; secret: string };

/**
 * Читает и валидирует WORKER_URL/WORKER_SECRET.
 * Возвращает конфиг либо null, если что-то не задано (роут сам решит, как ответить).
 *
 * @param opts.defaultUrl запасной URL воркера (некоторые роуты исторически
 *   использовали http://127.0.0.1:8001 как дефолт — сохраняем это поведение).
 */
export function getWorkerConfig(opts?: { defaultUrl?: string }): WorkerConfig | null {
  const url = process.env.WORKER_URL || opts?.defaultUrl;
  const secret = process.env.WORKER_SECRET;
  if (!url || !secret) return null;
  return { url, secret };
}

/** Результат вызова воркера: либо успешный Response, либо распознанная ошибка. */
export type CallWorkerResult =
  | { ok: true; res: Response }
  | { ok: false; kind: "timeout" | "network"; error: unknown };

/**
 * Делает запрос к воркеру с таймаутом через AbortController.
 *
 * Возвращает дискриминированный результат — сетевые/таймаут-ошибки не светятся
 * наружу, роут сам маппит kind в нужный статус (504 для timeout, 502 для network).
 * При ok=true вызывающий обязан сам проверить res.ok (см. workerErrorText).
 */
export async function callWorker(
  config: WorkerConfig,
  path: string,
  init: { method?: string; body?: BodyInit; timeoutMs: number; headers?: Record<string, string> },
): Promise<CallWorkerResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs);
  try {
    const res = await fetch(`${config.url}${path}`, {
      method: init.method ?? "POST",
      headers: { [WORKER_SECRET_HEADER]: config.secret, ...init.headers },
      body: init.body,
      signal: controller.signal,
    });
    return { ok: true, res };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return { ok: false, kind: aborted ? "timeout" : "network", error: e };
  } finally {
    clearTimeout(timer);
  }
}

/** Безопасно читает тело ошибки воркера и обрезает до WORKER_ERROR_MAX_BYTES. */
export async function workerErrorText(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  return text.slice(0, WORKER_ERROR_MAX_BYTES);
}

/** Допустимые MIME-типы загружаемых таблиц (CSV/Excel). */
const ALLOWED_UPLOAD_MIME = new Set([
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls (а также частый MIME для .csv)
]);

/** Допустимые расширения загружаемых таблиц. */
const ALLOWED_UPLOAD_EXT = [".csv", ".xlsx", ".xls"];

/**
 * Проверяет, что загружаемый файл — CSV или Excel.
 *
 * Браузеры часто шлют пустой/нестандартный MIME (особенно для .csv), поэтому
 * принимаем файл, если ЛИБО MIME в белом списке, ЛИБО расширение допустимо.
 * Сам разбор содержимого делает worker — здесь лишь грубый фильтр от заведомо
 * чужих форматов (zip, exe, изображения).
 */
export function isAllowedUploadFile(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  if (type && ALLOWED_UPLOAD_MIME.has(type)) return true;
  const name = (file.name || "").toLowerCase();
  return ALLOWED_UPLOAD_EXT.some(ext => name.endsWith(ext));
}

/**
 * Fire-and-forget пересчёт метрик: web дёргает POST /jobs/recalc/{sellerId}
 * и не ждёт ответа. Воркер сам дедуплицирует. Ошибки/таймаут игнорируются —
 * пересчёт всё равно запустится по расписанию, а UI может нажать recalc вручную.
 */
export function fireAndForgetRecalc(config: WorkerConfig, sellerId: string, timeoutMs = 5_000): void {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  fetch(`${config.url}/jobs/recalc/${sellerId}`, {
    method: "POST",
    headers: { [WORKER_SECRET_HEADER]: config.secret },
    signal: controller.signal,
  })
    .catch(() => null)
    .finally(() => clearTimeout(timer));
}
