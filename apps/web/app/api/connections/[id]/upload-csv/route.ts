import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth";
import {
  getWorkerConfig,
  callWorker,
  workerErrorText,
  fireAndForgetRecalc,
  isAllowedUploadFile,
} from "@/lib/api";

/**
 * POST /api/connections/[id]/upload-csv
 * multipart/form-data: file=<csv>
 *
 * Пробрасывает CSV в worker /ingest/csv?seller_id=...
 *
 * БАГ 38-41 fix: rate limit, лимит размера файла 20MB, timeout 120s, валидация ENV.
 * БАГ 77/78 fix: не светим network errors наружу, worker error text обрезаем до 500 байт.
 */

const MAX_FILE_SIZE = 20 * 1024 * 1024;  // 20MB
const WORKER_TIMEOUT_MS = 120_000;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;

  const limited = enforceRateLimit(req, RATE_LIMITS.EXPENSIVE, user.id);
  if (limited) return limited;

  const { data: conn } = await supabase
    .from("data_connections")
    .select("id, source, seller_id")
    .eq("id", id)
    .eq("seller_id", user.id)
    .maybeSingle();
  if (!conn || conn.source !== "csv_upload") {
    return NextResponse.json({ error: "Connection не подходит для CSV-загрузки" }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Невалидные multipart-данные" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не получен" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({
      error: `Файл слишком большой (${(file.size / 1024 / 1024).toFixed(1)}MB > лимита ${MAX_FILE_SIZE / 1024 / 1024}MB)`
    }, { status: 413 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Файл пустой" }, { status: 400 });
  }
  if (!isAllowedUploadFile(file)) {
    return NextResponse.json({ error: "Поддерживаются только файлы CSV или Excel (.csv, .xlsx, .xls)" }, { status: 400 });
  }

  const worker = getWorkerConfig();
  if (!worker) {
    console.error("[upload-csv] WORKER_URL/WORKER_SECRET not configured");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const workerForm = new FormData();
  workerForm.append("file", file);

  const result = await callWorker(worker, `/ingest/csv?seller_id=${user.id}`, {
    method: "POST",
    body: workerForm,
    timeoutMs: WORKER_TIMEOUT_MS,
  });
  if (!result.ok) {
    if (result.kind === "timeout") {
      return NextResponse.json({
        error: `Worker не ответил за ${WORKER_TIMEOUT_MS / 1000}с`
      }, { status: 504 });
    }
    // БАГ 77: не светим network errors
    console.error("[upload-csv] worker network error:", result.error instanceof Error ? result.error.message : result.error);
    return NextResponse.json({ error: "Ошибка связи с worker" }, { status: 502 });
  }

  const res = result.res;
  if (!res.ok) {
    // Worker text может содержать user-facing message (CSV parse error: ...,
    // "колонка sku обязательна" etc.), обрезаем длинные stacktraces
    return NextResponse.json({ error: await workerErrorText(res) }, { status: res.status });
  }

  // После успешной загрузки — пометим коннекшн активным
  await supabase
    .from("data_connections")
    .update({ status: "active", last_sync_at: new Date().toISOString(), last_error: null })
    .eq("id", id);

  // Fire-and-forget пересчёт
  fireAndForgetRecalc(worker, user.id);

  return NextResponse.json(await res.json());
}
