/**
 * Глобальный healthcheck — для UptimeRobot / BetterUptime / nginx upstream probes.
 *
 * Проверяет:
 *  - Supabase доступен (простой select count(*) from sellers)
 *  - Worker доступен (GET /health)
 *  - environment вары на месте
 *
 * Возвращает 200 если всё живо, 503 если что-то в down state.
 * Не требует auth — это инфраструктурный endpoint.
 */
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const checks: Record<string, { ok: boolean; latency_ms?: number; error?: string }> = {};
  const start = Date.now();

  // Supabase ping
  try {
    const t0 = Date.now();
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("sellers").select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    checks.supabase = { ok: true, latency_ms: Date.now() - t0 };
  } catch (e: any) {
    checks.supabase = { ok: false, error: e?.message || String(e) };
  }

  // Worker ping
  try {
    const t0 = Date.now();
    const workerUrl = process.env.WORKER_URL;
    if (!workerUrl) throw new Error("WORKER_URL not configured");
    const res = await fetch(`${workerUrl}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    checks.worker = { ok: true, latency_ms: Date.now() - t0 };
  } catch (e: any) {
    checks.worker = { ok: false, error: e?.message || String(e) };
  }

  // Env vars
  const requiredEnv = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "WORKER_URL",
    "WORKER_SECRET",
  ];
  const missing = requiredEnv.filter(k => !process.env[k]);
  checks.env = { ok: missing.length === 0, error: missing.length ? `Missing: ${missing.join(", ")}` : undefined };

  const allOk = Object.values(checks).every(c => c.ok);

  return NextResponse.json(
    {
      status: allOk ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      total_latency_ms: Date.now() - start,
      checks,
    },
    { status: allOk ? 200 : 503 },
  );
}
