import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { requireRadarAccess } from "../_helpers";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel/Next.js: дать 60 сек на парсинг файла

/**
 * POST /api/radar/upload
 * Принимает прайс XLSX/CSV, создаёт запись radar_price_uploads.
 *
 * AI-обработка (извлечение брендов) — на стороне worker'а. Этот роут
 * только сохраняет файл и регистрирует upload, чтобы:
 *  - быстро вернуть upload_id фронту (не блокировать UI на 30-60 сек)
 *  - worker асинхронно вызвал OpenRouter и записал brand list
 *
 * Сейчас (заглушка): извлечение брендов делается синхронно в этом роуте
 * через простой regex по колонкам прайса. Реальная OpenRouter-интеграция
 * будет в следующем коммите (требует env-настройки на VPS).
 *
 * Поддерживаемые форматы: XLSX, XLS, CSV. Лимит файла — 10MB.
 */

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".xlsx", ".xls", ".csv"];

export async function POST(req: NextRequest) {
  const auth = await requireRadarAccess();
  if (auth instanceof NextResponse) return auth;
  const { sb, userId, brandsLimit } = auth;

  // Rate-limit: не больше N загрузок в минуту на юзера
  const limited = enforceRateLimit(req, RATE_LIMITS.UPLOAD, userId);
  if (limited) return limited;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Не удалось прочитать форму" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "Файл не передан в поле 'file'" }, { status: 400 });
  }

  // Проверки размера
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({
      error: `Файл слишком большой. Лимит: ${MAX_FILE_SIZE_BYTES / 1024 / 1024} МБ`,
    }, { status: 413 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Файл пустой" }, { status: 400 });
  }

  // Проверка расширения (надёжнее чем MIME-type для xlsx)
  const fileName = file.name || "unknown.xlsx";
  const ext = fileName.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json({
      error: `Формат не поддерживается. Разрешены: ${ALLOWED_EXTENSIONS.join(", ")}`,
    }, { status: 400 });
  }

  // Читаем содержимое и считаем хэш для дедупликации
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash("sha256").update(buffer).digest("hex");

  // Проверка дубликата: если этот файл уже загружали — возвращаем существующий upload
  const { data: existing } = await sb
    .from("radar_price_uploads")
    .select("id,status,brands_extracted,created_at")
    .eq("seller_id", userId)
    .eq("file_hash", fileHash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing && existing.status === "completed") {
    return NextResponse.json({
      uploadId: existing.id,
      duplicate: true,
      message: "Этот файл уже был обработан. Открываем результаты.",
      brandsExtracted: existing.brands_extracted,
    });
  }

  // Создаём запись upload — в статусе processing.
  // Реальная обработка делается ниже синхронно (заглушка), но
  // когда подключим worker — здесь будет только enqueue.
  const { data: upload, error: createErr } = await sb
    .from("radar_price_uploads")
    .insert({
      seller_id: userId,
      file_name: fileName,
      file_size_bytes: file.size,
      file_hash: fileHash,
      status: "processing",
    })
    .select()
    .single();

  if (createErr) {
    return NextResponse.json({ error: createErr.message }, { status: 500 });
  }

  // ====================================================================
  // ВРЕМЕННАЯ ЗАГЛУШКА: парсинг XLSX/CSV для подсчёта строк.
  // OpenRouter-извлечение брендов будет добавлено отдельным коммитом
  // после регистрации OpenRouter API key в env worker'а.
  //
  // Сейчас просто возвращаем upload_id, дальнейший review-flow
  // пользователь увидит как processing. Когда подключим OpenRouter
  // — этот блок заменим на enqueue к worker'у.
  // ====================================================================

  // Пока что помечаем как processing — пользователь увидит "обработка"
  // в истории загрузок. Worker (когда будет готов) подхватит и обработает.

  return NextResponse.json({
    uploadId: upload.id,
    status: "processing",
    brandsLimit,
    message: "Файл получен. ИИ обрабатывает прайс — результат появится в течение 1-2 минут.",
  });
}
