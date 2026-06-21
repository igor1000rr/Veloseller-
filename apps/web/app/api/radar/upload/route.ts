import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { requireUser, jsonError } from "@/lib/auth";
import { getWorkerConfig, callWorker, workerErrorText, isAllowedUploadFile } from "@/lib/api";
import crypto from "crypto";

// 50MB лимит на загрузку. Прайс 5000 SKU в OZON/WB обычно ~2-5 МБ.
const MAX_FILE_SIZE = 50 * 1024 * 1024;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Ожидание worker'а ~10-30 сек.

/**
 * POST /api/radar/upload — прокси к worker'у для извлечения брендов из прайса.
 *
 * Почему через worker, а не в Next.js:
 *   1. У worker'а (Python/FastAPI) уже есть openpyxl/pandas — не нужно
 *      тащить xlsx в Node.js (было проблемой с CDN tarball).
 *   2. Парсинг прайса (частотный анализатор, без внешних AI) живёт на worker'е
 *      вместе с остальной логикой Radar (15-30 сек — нормальный процесс).
 *
 * Flow:
 *   1. Auth + проверка тарифа.
 *   2. Создаём radar_price_uploads (status=processing) через admin client.
 *   3. Проксим FormData в worker POST /radar/extract-brands с X-Worker-Secret.
 *   4. Worker сам обновит radar_price_uploads + вставит radar_brands.
 *   5. Редиректим юзера на /dashboard/radar/brands.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase: sb, user } = auth;

  // Rate limit — парсинг прайса (pandas/openpyxl на worker'е) дорогая операция.
  const limited = enforceRateLimit(req, RATE_LIMITS.EXPENSIVE, user.id);
  if (limited) return limited;

  // Проверка тарифа.
  const { data: seller } = await sb
    .from("sellers")
    .select("radar_plan, radar_brands_limit, radar_active_until")
    .eq("id", user.id)
    .maybeSingle();
  const hasRadar = seller && seller.radar_plan && seller.radar_plan !== "none"
    && (!seller.radar_active_until || new Date(seller.radar_active_until) > new Date());
  if (!hasRadar) {
    return NextResponse.json({ error: "Подключите Radar в /billing" }, { status: 403 });
  }

  // Файл.
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({
      error: `Файл слишком большой: ${(file.size / 1024 / 1024).toFixed(1)}МБ > 50МБ`
    }, { status: 413 });
  }
  if (!isAllowedUploadFile(file)) {
    return NextResponse.json({ error: "Поддерживаются только файлы CSV или Excel (.csv, .xlsx, .xls)" }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();
  const fileHash = crypto.createHash("sha256")
    .update(Buffer.from(buffer))
    .digest("hex");

  // Создаём запись upload (status=processing) ДО вызова worker'а,
  // чтобы иметь uploadId для worker'а и отображать сразу в истории.
  const admin = createSupabaseAdminClient();
  const { data: uploadRow, error: uploadErr } = await admin
    .from("radar_price_uploads")
    .insert({
      seller_id: user.id,
      file_name: file.name,
      file_size_bytes: file.size,
      file_hash: fileHash,
      status: "processing",
    })
    .select("id")
    .single();

  if (uploadErr || !uploadRow) {
    // Деталь (SQL/constraint) — только в логи, наружу общий текст.
    return jsonError(500, "Не удалось создать запись upload", uploadErr?.message);
  }

  const uploadId = uploadRow.id;

  // Проксим в worker.
  const worker = getWorkerConfig({ defaultUrl: "http://127.0.0.1:8001" });
  if (!worker) {
    await admin.from("radar_price_uploads")
      .update({ status: "failed", error_message: "WORKER_SECRET not configured" })
      .eq("id", uploadId);
    return NextResponse.json({ error: "Сервис временно недоступен" }, { status: 500 });
  }

  // Пересобираем FormData для worker'а — он ожидает seller_id + upload_id + file.
  const workerForm = new FormData();
  workerForm.append("seller_id", user.id);
  workerForm.append("upload_id", uploadId);
  // Передаём файл из входящего буфера (экономим память — не читаем файл дважды).
  const blob = new Blob([buffer]);
  workerForm.append("file", blob, file.name);

  // 90 сек timeout — AI обычно 10-30 сек, но бывают retry и медленные провайдеры.
  const result = await callWorker(worker, "/radar/extract-brands", {
    method: "POST",
    body: workerForm,
    timeoutMs: 90_000,
  });

  if (!result.ok) {
    // Network/timeout — помечаем upload как failed (worker мог не успеть).
    const detail = result.error instanceof Error ? result.error.message : String(result.error);
    console.error("[radar-upload] worker unreachable:", detail);
    await admin.from("radar_price_uploads")
      .update({
        status: "failed",
        error_message: `Web→Worker: ${detail.slice(0, 400)}`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", uploadId)
      // Обновляем только если status всё ещё processing (не перезаписываем completed/failed от worker'а).
      .eq("status", "processing");
    // БАГ-фикс: не светим e?.message наружу — только общий текст.
    return NextResponse.json(
      { error: "Ошибка связи с worker'ом", upload_id: uploadId },
      { status: 502 }
    );
  }

  const res = result.res;
  if (!res.ok) {
    // worker уже пометил upload как failed — передаём его (обрезанный) текст в UI.
    const errBody = await workerErrorText(res);
    return NextResponse.json(
      { error: errBody || `Worker ${res.status}`, upload_id: uploadId },
      { status: 500 }
    );
  }

  const data: any = await res.json();
  return NextResponse.json({
    success: true,
    upload_id: uploadId,
    brands_extracted: data.brandsExtracted,
    brands_approved: data.brandsApproved,
    brands_excluded: data.brandsExcluded ?? 0,
    ai_cost_usd: data.aiCostUsd,
  });
}
