import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth";
import { getWorkerConfig, callWorker, isAllowedUploadFile } from "@/lib/api";

const MAX_FILE_SIZE = 50 * 1024 * 1024;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/cost-prices/import — массовая загрузка себестоимости.
 *
 * Проксирует файл в worker /cost-prices/import: парсинг CSV/XLSX, сопоставление
 * товаров по артикулу в пределах выбранного склада и проставление
 * products.cost_price. Возвращает {matched, totalRows, unmatched}.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase: sb, user } = auth;

  // Парсинг файла дорогой — тот же лимит, что у загрузки прайса Radar.
  const limited = enforceRateLimit(req, RATE_LIMITS.EXPENSIVE, user.id);
  if (limited) return limited;

  const form = await req.formData();
  const file = form.get("file");
  const connectionId = String(form.get("connection_id") ?? "").trim();
  const articleCol = String(form.get("article_col") ?? "").trim();
  const costCol = String(form.get("cost_col") ?? "").trim();

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({
      error: `Файл слишком большой: ${(file.size / 1024 / 1024).toFixed(1)}МБ > 50МБ`,
    }, { status: 413 });
  }
  if (!isAllowedUploadFile(file)) {
    return NextResponse.json({ error: "Поддерживаются только файлы CSV или Excel (.csv, .xlsx, .xls)" }, { status: 400 });
  }
  if (!connectionId) {
    return NextResponse.json({ error: "Не выбран склад" }, { status: 400 });
  }
  if (!articleCol || !costCol) {
    return NextResponse.json({
      error: "Укажите буквы колонок (артикул и себестоимость)",
    }, { status: 400 });
  }

  // Склад должен принадлежать пользователю (RLS бы тоже отфильтровал, но явная
  // проверка даёт понятную 404 вместо «0 сопоставлено»).
  const { data: conn } = await sb
    .from("data_connections")
    .select("id")
    .eq("id", connectionId)
    .eq("seller_id", user.id)
    .maybeSingle();
  if (!conn) {
    return NextResponse.json({ error: "Склад не найден" }, { status: 404 });
  }

  const worker = getWorkerConfig({ defaultUrl: "http://127.0.0.1:8001" });
  if (!worker) {
    return NextResponse.json({ error: "Сервис временно недоступен" }, { status: 500 });
  }

  const buffer = await file.arrayBuffer();
  const workerForm = new FormData();
  workerForm.append("seller_id", user.id);
  workerForm.append("connection_id", connectionId);
  workerForm.append("article_col", articleCol);
  workerForm.append("cost_col", costCol);
  workerForm.append("file", new Blob([buffer]), file.name);

  const result = await callWorker(worker, "/cost-prices/import", {
    method: "POST",
    body: workerForm,
    timeoutMs: 90_000,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.kind === "timeout" ? "Превышено время обработки файла" : "Ошибка обработки файла" },
      { status: 504 },
    );
  }

  const res = result.res;
  const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) {
    // FastAPI HTTPException → {detail}; наши прочие ошибки → {error}.
    return NextResponse.json(
      { error: body?.detail ?? body?.error ?? `HTTP ${res.status}` },
      { status: res.status },
    );
  }
  return NextResponse.json(body);
}
