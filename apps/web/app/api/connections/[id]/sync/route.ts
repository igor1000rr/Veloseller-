import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * POST /api/connections/[id]/sync
 *
 * Проксирует запрос в Python worker. Worker сам читает connection.config
 * через service_role и обновляет статус.
 *
 * БАГ 31-34 fix: rate limit (защита от спама и rate limit'ов маркетплейсов),
 * timeout на fetch worker'а, валидация ENV.
 */

const WORKER_TIMEOUT_MS = 180_000;  // 3 минуты — Ozon sync 1879 SKU укладывается

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit(req, RATE_LIMITS.EXPENSIVE, user.id);
  if (limited) return limited;

  const { data: conn } = await supabase
    .from("data_connections")
    .select("id, source, marketplace, seller_id")
    .eq("id", id)
    .eq("seller_id", user.id)
    .maybeSingle();

  if (!conn) return NextResponse.json({ error: "Connection не найдена" }, { status: 404 });

  const workerUrl = process.env.WORKER_URL;
  const workerSecret = process.env.WORKER_SECRET;
  if (!workerUrl || !workerSecret) {
    return NextResponse.json({
      error: "WORKER_URL/WORKER_SECRET не настроены на сервере"
    }, { status: 500 });
  }

  let endpoint = "";
  if (conn.source === "google_sheet") endpoint = `/ingest/google-sheet/${id}`;
  else if (conn.source === "marketplace_api" && conn.marketplace === "ozon") endpoint = `/ingest/ozon/${id}`;
  else if (conn.source === "marketplace_api" && conn.marketplace === "wildberries") endpoint = `/ingest/wb/${id}`;
  else return NextResponse.json({ error: "Для CSV используй upload-csv" }, { status: 400 });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${workerUrl}${endpoint}`, {
      method: "POST",
      headers: { "X-Worker-Secret": workerSecret },
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timeout);
    if (e?.name === "AbortError") {
      return NextResponse.json({
        error: `Worker не ответил за ${WORKER_TIMEOUT_MS / 1000}с. Попробуйте позже.`
      }, { status: 504 });
    }
    return NextResponse.json({
      error: `Ошибка связи с worker: ${e?.message || String(e)}`
    }, { status: 502 });
  }
  clearTimeout(timeout);

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: text }, { status: res.status });
  }

  // Fire-and-forget пересчёт с коротким таймаутом — он работает в background
  const recalcController = new AbortController();
  const recalcTimeout = setTimeout(() => recalcController.abort(), 5_000);
  fetch(`${workerUrl}/jobs/recalc/${user.id}`, {
    method: "POST",
    headers: { "X-Worker-Secret": workerSecret },
    signal: recalcController.signal,
  })
    .catch(() => null)
    .finally(() => clearTimeout(recalcTimeout));

  return NextResponse.json(await res.json());
}
