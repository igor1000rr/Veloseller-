import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * POST /api/connections/[id]/upload-csv
 * multipart/form-data: file=<csv>
 *
 * Пробрасывает CSV в worker /ingest/csv?seller_id=...
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: conn } = await supabase
    .from("data_connections")
    .select("id, source, seller_id")
    .eq("id", id)
    .eq("seller_id", user.id)
    .maybeSingle();
  if (!conn || conn.source !== "csv_upload") {
    return NextResponse.json({ error: "Connection не подходит для CSV-загрузки" }, { status: 400 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не получен" }, { status: 400 });
  }

  const workerUrl = process.env.WORKER_URL!;
  const workerSecret = process.env.WORKER_SECRET!;

  const workerForm = new FormData();
  workerForm.append("file", file);

  const res = await fetch(
    `${workerUrl}/ingest/csv?seller_id=${user.id}`,
    {
      method: "POST",
      headers: { "X-Worker-Secret": workerSecret },
      body: workerForm,
    },
  );

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: text }, { status: res.status });
  }

  // После успешной загрузки — пометим коннекшн активным и пересчитаем
  await supabase
    .from("data_connections")
    .update({ status: "active", last_sync_at: new Date().toISOString(), last_error: null })
    .eq("id", id);

  await fetch(`${workerUrl}/jobs/recalc/${user.id}`, {
    method: "POST",
    headers: { "X-Worker-Secret": workerSecret },
  }).catch(() => null);

  return NextResponse.json(await res.json());
}
