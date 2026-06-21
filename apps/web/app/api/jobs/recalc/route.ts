import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth";
import { getWorkerConfig, callWorker, workerErrorText } from "@/lib/api";

/**
 * POST /api/jobs/recalc
 * Ручной запуск пересчёта метрик для текущего селлера.
 *
 * Worker запускает recalc в background, сразу возвращает status.
 * UI поллит /api/jobs/recalc/status чтобы отображать прогресс.
 *
 * БАГ 28 fix: явная проверка ENV переменных вместо ! (TypeError в runtime).
 * БАГ 76 fix: не светим внутренние error messages в response.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  // Rate limit — recalc дорогая операция, 10/min/user
  const limited = enforceRateLimit(req, RATE_LIMITS.EXPENSIVE, user.id);
  if (limited) return limited;

  const worker = getWorkerConfig();
  if (!worker) {
    console.error("[recalc] WORKER_URL or WORKER_SECRET not configured");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const result = await callWorker(worker, `/jobs/recalc/${user.id}`, { method: "POST", timeoutMs: 15_000 });
  if (!result.ok) {
    console.error("[recalc] network error:", result.error instanceof Error ? result.error.message : result.error);
    return NextResponse.json({ error: "Worker unreachable" }, { status: 502 });
  }
  const res = result.res;
  if (!res.ok) {
    // БАГ 76: подробно в console, наружу — только статус и общий код
    console.error("[recalc] worker non-2xx:", res.status, await workerErrorText(res));
    return NextResponse.json({ error: `Worker error (HTTP ${res.status})` }, { status: 502 });
  }
  return NextResponse.json(await res.json());
}
