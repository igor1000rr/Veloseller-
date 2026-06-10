import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import UploadForm from "./UploadForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RadarUploadPage() {
  const sb = await createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  // Последние 5 загрузок — для истории на странице.
  const { data: uploads } = await sb
    .from("radar_price_uploads")
    .select("id, file_name, rows_total, brands_extracted, brands_approved, status, ai_cost_usd, created_at, completed_at, error_message")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href={"/dashboard/radar" as any} className="text-xs font-mono uppercase tracking-wider text-ink-hush hover:text-ink transition mb-2 inline-block">
          ← К Radar
        </Link>
        <h1 className="font-display text-2xl md:text-3xl font-medium text-ink">Загрузка прайса</h1>
        <p className="mt-1 text-sm text-ink-muted max-w-xl">
          Загрузите CSV или XLSX прайс поставщика — ИИ извлечёт список брендов.
          После обработки здесь появятся статус, число строк и извлечённых
          брендов. Затем перейдите к брендам, чтобы подтвердить список.
        </p>
      </div>

      <UploadForm />

      {(uploads ?? []).length > 0 && (
        <div>
          <h3 className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-3">
            История загрузок
          </h3>
          <div className="rounded-2xl border border-line bg-paper overflow-hidden">
            {(uploads ?? []).map((u, i, arr) => (
              <div key={u.id} className={`px-4 py-3 ${i < arr.length - 1 ? "border-b border-line" : ""} flex items-center justify-between flex-wrap gap-2`}>
                <div className="min-w-0">
                  <div className="font-medium text-ink truncate">{u.file_name}</div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-ink-hush mt-1 flex gap-3 flex-wrap">
                    <span>{new Date(u.created_at).toLocaleString("ru")}</span>
                    <span>строк: {u.rows_total ?? "—"}</span>
                    <span>брендов: {u.brands_extracted ?? "—"}</span>
                    {u.ai_cost_usd != null && <span>${Number(u.ai_cost_usd).toFixed(4)}</span>}
                  </div>
                </div>
                <StatusBadge status={u.status} error={u.error_message} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, error }: { status: string; error?: string | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    processing: { label: "обработка", cls: "text-azure border-azure/40 bg-azure/10" },
    completed:  { label: "готово",    cls: "text-lime-deep border-lime-deep/40 bg-lime-soft" },
    failed:     { label: "ошибка",    cls: "text-rose border-rose/40 bg-rose/10" },
  };
  const s = map[status] ?? map.processing;
  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded border text-[10px] font-mono uppercase tracking-wider font-semibold ${s.cls}`}
      title={error ?? undefined}
    >
      {s.label}
    </span>
  );
}
