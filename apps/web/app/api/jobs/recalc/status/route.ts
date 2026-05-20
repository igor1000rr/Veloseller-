import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/jobs/recalc/status
 * Статус бекграунд-recalc для текущего селлера. UI поллит каждые ~10с пока status=running.
 *
 * Без rate limit — это polling endpoint, UI вызывает его много раз подряд.
 *
 * БАГ 28 fix: явная проверка ENV вместо ! (TypeError в runtime).
 */
export async function GET(_req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workerUrl = process.env.WORKER_URL;
  const workerSecret = process.env.WORKER_SECRET;
  if (!workerUrl || !workerSecret) {
    return NextResponse.json({ status: "unknown", error: "Server misconfigured" }, { status: 500 });
  }

  try {
    const res = await fetch(`${workerUrl}/jobs/recalc/${user.id}/status`, {
      method: "GET",
      headers: { "X-Worker-Secret": workerSecret },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return NextResponse.json({ status: "unknown" });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ status: "unknown", error: e?.message || "unknown" });
  }
}
