import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * POST /api/connections/[id]/sync
 *
 * Проксирует запрос в Python worker. Worker сам читает connection.config
 * через service_role и обновляет статус.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Проверяем, что connection действительно принадлежит этому пользователю
  const { data: conn } = await supabase
    .from("data_connections")
    .select("id, source, marketplace, seller_id")
    .eq("id", id)
    .eq("seller_id", user.id)
    .maybeSingle();

  if (!conn) return NextResponse.json({ error: "Connection не найдена" }, { status: 404 });

  const workerUrl = process.env.WORKER_URL!;
  const workerSecret = process.env.WORKER_SECRET!;

  let endpoint = "";
  if (conn.source === "google_sheet") endpoint = `/ingest/google-sheet/${id}`;
  else if (conn.source === "marketplace_api" && conn.marketplace === "ozon") endpoint = `/ingest/ozon/${id}`;
  else if (conn.source === "marketplace_api" && conn.marketplace === "wildberries") endpoint = `/ingest/wb/${id}`;
  else return NextResponse.json({ error: "Для CSV используй upload-csv" }, { status: 400 });

  const res = await fetch(`${workerUrl}${endpoint}`, {
    method: "POST",
    headers: { "X-Worker-Secret": workerSecret },
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: text }, { status: res.status });
  }

  // Запускаем пересчёт метрик после успешного синка
  await fetch(`${workerUrl}/jobs/recalc/${user.id}`, {
    method: "POST",
    headers: { "X-Worker-Secret": workerSecret },
  }).catch(() => null);

  return NextResponse.json(await res.json());
}
