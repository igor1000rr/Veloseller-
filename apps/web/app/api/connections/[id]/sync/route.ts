import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * POST /api/connections/[id]/sync
 *
 * Запускает sync в worker'е и СРАЗУ возвращает 202 Accepted (fire-and-forget).
 * Worker работает в фоне ~60-90с на 1879 SKU; ждать его в Next.js — нельзя,
 * т.к. nginx таймаутит на 60с (БАГ 85) и клиент получает 504, хотя worker
 * успешно завершает sync. UI должен поллить status через GET /api/connections
 * (поле last_sync_at и status), worker сам обновит data_connections.
 *
 * БАГ 31-34 fix: rate limit, валидация ENV.
 * БАГ 77 fix: не светим внутренние network errors наружу.
 * БАГ 85 fix: fire-and-forget вместо ожидания worker'а.
 */

// Короткий таймаут только на сам HTTP-запрос инициации к worker'у
// (worker должен ответить 202 в течение секунд, а не выполнять sync).
const WORKER_INIT_TIMEOUT_MS = 8_000;

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
    console.error("[sync] WORKER_URL/WORKER_SECRET not configured");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  let endpoint = "";
  if (conn.source === "google_sheet") endpoint = `/ingest/google-sheet/${id}`;
  else if (conn.source === "marketplace_api" && conn.marketplace === "ozon") endpoint = `/ingest/ozon/${id}`;
  else if (conn.source === "marketplace_api" && conn.marketplace === "wildberries") endpoint = `/ingest/wb/${id}`;
  else return NextResponse.json({ error: "Для CSV используй upload-csv" }, { status: 400 });

  // Отмечаем connection как "syncing" чтобы UI видел прогресс
  await supabase
    .from("data_connections")
    .update({ status: "syncing", last_error: null })
    .eq("id", id);

  // Fire-and-forget: пинаем worker, но не ждём результата.
  // Worker сам обновит data_connections.status (active/error) и last_sync_at.
  // У fetch() короткий timeout на инициацию запроса — если worker DOWN,
  // мы это узнаем и сразу скажем пользователю.
  const initController = new AbortController();
  const initTimeout = setTimeout(() => initController.abort(), WORKER_INIT_TIMEOUT_MS);

  // ВАЖНО: НЕ await — fire-and-forget. fetch продолжится в Node-runtime
  // (sync операция в worker'е займёт 60-90с, но nginx не блокируется).
  const initPromise = fetch(`${workerUrl}${endpoint}`, {
    method: "POST",
    headers: { "X-Worker-Secret": workerSecret },
    signal: initController.signal,
  }).then(async (res) => {
    clearTimeout(initTimeout);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[sync] worker returned non-ok:", res.status, text.slice(0, 200));
      // Запишем ошибку в data_connections.last_error чтобы UI её увидел
      try {
        await supabase
          .from("data_connections")
          .update({ status: "error", last_error: text.slice(0, 500) })
          .eq("id", id);
      } catch {}
    } else {
      // После успешного sync — fire-and-forget recalc
      try {
        const recalcCtrl = new AbortController();
        const recalcTimeout = setTimeout(() => recalcCtrl.abort(), 5_000);
        await fetch(`${workerUrl}/jobs/recalc/${user.id}`, {
          method: "POST",
          headers: { "X-Worker-Secret": workerSecret },
          signal: recalcCtrl.signal,
        });
        clearTimeout(recalcTimeout);
      } catch {}
    }
  }).catch((e: any) => {
    clearTimeout(initTimeout);
    if (e?.name === "AbortError") {
      // Worker не ответил на init за 8с — скорее всего DOWN
      console.error("[sync] worker init timeout");
      supabase
        .from("data_connections")
        .update({ status: "error", last_error: "Worker недоступен" })
        .eq("id", id)
        .then(() => {}, () => {});
    } else {
      console.error("[sync] worker network error:", e?.message);
      supabase
        .from("data_connections")
        .update({ status: "error", last_error: "Network error" })
        .eq("id", id)
        .then(() => {}, () => {});
    }
  });

  // Edge runtime может убить background task. В Node.js runtime — нет.
  // Этот route уже работает в Node.js (есть импорты server-only Supabase).
  // Promise продолжит работать в фоне и сам обновит БД.
  void initPromise;

  return NextResponse.json(
    {
      started: true,
      message: "Sync запущен. Дождитесь обновления статуса (~1-2 минуты).",
    },
    { status: 202 }
  );
}
