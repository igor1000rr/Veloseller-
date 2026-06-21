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
 *
 * БАГ 74 fix: не отдаём детальные error messages (internal info disclosure).
 *   Логируем подробно в console, наружу — только ok/false.
 * БАГ 75 fix: rate limit чтобы не было amplification (каждый запрос делает DB + worker hit).
 */
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { callWorker } from "@/lib/api";

export async function GET(req: NextRequest) {
  // БАГ 75: лимит 60 запросов в минуту с IP (UptimeRobot шлёт каждые 5 мин, для healthcheck'а с запасом)
  const limited = enforceRateLimit(req, { max: 60, windowMs: 60_000 });
  if (limited) return limited;

  const checks: Record<string, { ok: boolean; latency_ms?: number }> = {};
  const start = Date.now();

  // Supabase ping
  try {
    const t0 = Date.now();
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("sellers").select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    checks.supabase = { ok: true, latency_ms: Date.now() - t0 };
  } catch (e: any) {
    console.error("[health] supabase down:", e?.message);
    checks.supabase = { ok: false };  // БАГ 74: без детального error
  }

  // Worker ping. /health воркера публичный — секрет не обязателен (передаём,
  // если задан, воркеру он не мешает). Таймаут/AbortController — через callWorker.
  try {
    const t0 = Date.now();
    const workerUrl = process.env.WORKER_URL;
    if (!workerUrl) throw new Error("WORKER_URL not configured");
    const result = await callWorker(
      { url: workerUrl, secret: process.env.WORKER_SECRET ?? "" },
      "/health",
      { method: "GET", timeoutMs: 3000 },
    );
    if (!result.ok) throw result.error;
    if (!result.res.ok) throw new Error(`HTTP ${result.res.status}`);
    checks.worker = { ok: true, latency_ms: Date.now() - t0 };
  } catch (e: any) {
    console.error("[health] worker down:", e?.message);
    checks.worker = { ok: false };  // БАГ 74: без детального error
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
  if (missing.length > 0) {
    console.error("[health] missing env:", missing.join(", "));
  }
  checks.env = { ok: missing.length === 0 };

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
