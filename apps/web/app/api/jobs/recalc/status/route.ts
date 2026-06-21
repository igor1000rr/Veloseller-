import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getWorkerConfig, callWorker } from "@/lib/api";

/**
 * GET /api/jobs/recalc/status
 * Статус бекграунд-recalc для текущего селлера. UI поллит каждые ~10с пока status=running.
 *
 * Без rate limit — это polling endpoint, UI вызывает его много раз подряд.
 *
 * БАГ 28 fix: явная проверка ENV вместо ! (TypeError в runtime).
 * БАГ 76 fix: не светим e.message в response — info disclosure про internal hostnames.
 */
export async function GET(_req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  const worker = getWorkerConfig();
  if (!worker) {
    return NextResponse.json({ status: "unknown" }, { status: 500 });
  }

  const result = await callWorker(worker, `/jobs/recalc/${user.id}/status`, { method: "GET", timeoutMs: 5_000 });
  if (!result.ok) {
    // БАГ 76: логируем подробно, отдаём наружу только статус
    console.error("[recalc-status] worker unreachable:", result.error instanceof Error ? result.error.message : result.error);
    return NextResponse.json({ status: "unknown" });
  }
  if (!result.res.ok) return NextResponse.json({ status: "unknown" });
  return NextResponse.json(await result.res.json());
}
