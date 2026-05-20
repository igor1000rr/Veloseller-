import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

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
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit — recalc дорогая операция, 10/min/user
  const limited = enforceRateLimit(req, RATE_LIMITS.EXPENSIVE, user.id);
  if (limited) return limited;

  const workerUrl = process.env.WORKER_URL;
  const workerSecret = process.env.WORKER_SECRET;
  if (!workerUrl || !workerSecret) {
    console.error("[recalc] WORKER_URL or WORKER_SECRET not configured");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  try {
    const res = await fetch(`${workerUrl}/jobs/recalc/${user.id}`, {
      method: "POST",
      headers: { "X-Worker-Secret": workerSecret },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      // БАГ 76: подробно в console, наружу — только статус и общий код
      const body = await res.text();
      console.error("[recalc] worker non-2xx:", res.status, body.slice(0, 500));
      return NextResponse.json({ error: `Worker error (HTTP ${res.status})` }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    console.error("[recalc] network error:", e?.message);
    return NextResponse.json({ error: "Worker unreachable" }, { status: 502 });
  }
}
