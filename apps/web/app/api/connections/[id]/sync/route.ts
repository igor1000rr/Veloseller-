import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth";
import { getWorkerConfig, callWorker, workerErrorText, fireAndForgetRecalc } from "@/lib/api";

/**
 * POST /api/connections/[id]/sync
 *
 * Проксирует запрос в Python worker. Worker сам читает connection.config
 * через service_role, запускает sync в BackgroundTask и обновляет статус.
 *
 * БАГ 31-34 fix: rate limit, timeout на fetch worker'а, валидация ENV.
 * БАГ 77 fix: не светим внутренние network/connection ошибки наружу. Worker error
 *   passthrough оставляем — пользователь должен видеть "WB API key неверный".
 * БАГ 85 fix: worker теперь возвращает immediately после валидации (BG task),
 *   так что nginx upstream timeout больше не стреляет даже на 1879+ SKU.
 */

const WORKER_TIMEOUT_MS = 30_000;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;

  const limited = enforceRateLimit(req, RATE_LIMITS.EXPENSIVE, user.id);
  if (limited) return limited;

  const { data: conn } = await supabase
    .from("data_connections")
    .select("id, source, marketplace, seller_id")
    .eq("id", id)
    .eq("seller_id", user.id)
    .maybeSingle();

  if (!conn) return NextResponse.json({ error: "Connection не найдена" }, { status: 404 });

  const worker = getWorkerConfig();
  if (!worker) {
    console.error("[sync] WORKER_URL/WORKER_SECRET not configured");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  let endpoint = "";
  if (conn.source === "google_sheet") endpoint = `/ingest/google-sheet/${id}`;
  else if (conn.source === "marketplace_api" && conn.marketplace === "ozon") endpoint = `/ingest/ozon/${id}`;
  else if (conn.source === "marketplace_api" && conn.marketplace === "wildberries") endpoint = `/ingest/wb/${id}`;
  else if (conn.source === "marketplace_api" && conn.marketplace === "shopify") endpoint = `/ingest/shopify/${id}`;
  else return NextResponse.json({ error: "Для CSV используй upload-csv" }, { status: 400 });

  const result = await callWorker(worker, endpoint, { method: "POST", timeoutMs: WORKER_TIMEOUT_MS });
  if (!result.ok) {
    if (result.kind === "timeout") {
      return NextResponse.json({
        error: `Worker не ответил за ${WORKER_TIMEOUT_MS / 1000}с. Попробуйте позже.`
      }, { status: 504 });
    }
    console.error("[sync] worker network error:", result.error instanceof Error ? result.error.message : result.error);
    return NextResponse.json({ error: "Ошибка связи с worker" }, { status: 502 });
  }

  const res = result.res;
  if (!res.ok) {
    return NextResponse.json({ error: await workerErrorText(res) }, { status: res.status });
  }

  // Fire-and-forget пересчёт — запустим после того как sync завершится в worker'е.
  // Но поскольку sync теперь BG task, просто пускаем recalc через ~2 минуты
  // (чтобы дать sync завершиться). UI также нажмёт recalc вручную.
  // Worker /jobs/recalc сам дедуплицирует.
  fireAndForgetRecalc(worker, user.id);

  return NextResponse.json(await res.json());
}
