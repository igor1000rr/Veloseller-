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
      const body = await res.text();
      return NextResponse.json({ error: `Worker: ${res.status} ${body.slice(0, 200)}` }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: `Network: ${e?.message || "unknown"}` }, { status: 502 });
  }
}
