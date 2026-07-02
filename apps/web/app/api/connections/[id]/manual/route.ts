import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth";
import { getWorkerConfig, callWorker, workerErrorText, fireAndForgetRecalc } from "@/lib/api";

/**
 * POST /api/connections/[id]/manual
 * body: { items: [{ sku, product_name?, stock_quantity, price }] }
 *
 * Ручной режим: добавление/обновление товаров и остатков. Проксирует в worker
 * /ingest/manual/[id], который персистит снапшоты source=manual. Правки
 * «продажи −N / пополнения +N» веб-слой присылает уже как новый остаток.
 */

const WORKER_TIMEOUT_MS = 60_000;
const MAX_ITEMS = 50_000;

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
  if (!conn || conn.source !== "manual") {
    return NextResponse.json({ error: "Склад не поддерживает ручной ввод" }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Невалидный JSON" }, { status: 400 });
  }
  const items = body?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Список товаров пуст" }, { status: 400 });
  }
  if (items.length > MAX_ITEMS) {
    return NextResponse.json({ error: `Слишком много позиций (максимум ${MAX_ITEMS})` }, { status: 400 });
  }

  const worker = getWorkerConfig();
  if (!worker) {
    console.error("[manual] WORKER_URL/WORKER_SECRET not configured");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const result = await callWorker(worker, `/ingest/manual/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
    timeoutMs: WORKER_TIMEOUT_MS,
  });
  if (!result.ok) {
    if (result.kind === "timeout") {
      return NextResponse.json({ error: `Worker не ответил за ${WORKER_TIMEOUT_MS / 1000}с` }, { status: 504 });
    }
    console.error("[manual] worker network error:", result.error instanceof Error ? result.error.message : result.error);
    return NextResponse.json({ error: "Ошибка связи с worker" }, { status: 502 });
  }

  const res = result.res;
  if (!res.ok) {
    return NextResponse.json({ error: await workerErrorText(res) }, { status: res.status });
  }

  // Пересчёт метрик в фоне
  fireAndForgetRecalc(worker, user.id);

  return NextResponse.json(await res.json());
}
