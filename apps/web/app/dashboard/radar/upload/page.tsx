import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { UploadForm } from "./UploadForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function UploadPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: seller } = await supabase
    .from("sellers")
    .select("radar_plan,radar_brands_limit")
    .eq("id", user.id)
    .maybeSingle();

  const radarPlan = (seller as any)?.radar_plan ?? "none";
  if (radarPlan === "none") redirect("/dashboard/radar");

  const brandsLimit = (seller as any)?.radar_brands_limit ?? 0;

  // История последних загрузок (для UX — пользователь видит что повторно тот же файл грузить не надо)
  const { data: uploads } = await supabase
    .from("radar_price_uploads")
    .select("id,file_name,rows_total,brands_extracted,brands_approved,status,error_message,created_at,completed_at")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link
          href={"/dashboard/radar" as any}
          className="font-mono text-[11px] uppercase tracking-wider text-ink-hush hover:text-ink transition mb-2 inline-block"
        >
          ← Назад в Radar
        </Link>
        <h1 className="font-display text-2xl sm:text-3xl font-medium tracking-tight text-ink">
          Загрузка прайса
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          ИИ извлечёт бренды из вашего прайса. Лимит тарифа — {brandsLimit} брендов.
        </p>
      </div>

      <UploadForm brandsLimit={brandsLimit} />

      {uploads && uploads.length > 0 && (
        <div className="rounded-2xl border border-line bg-paper overflow-hidden">
          <div className="px-4 py-3 border-b border-line bg-bg-soft">
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">
              История загрузок
            </h3>
          </div>
          <table className="w-full text-sm">
            <thead className="border-b border-line">
              <tr>
                <th className="text-left px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Файл</th>
                <th className="text-right px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Строк</th>
                <th className="text-right px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Брендов</th>
                <th className="text-left px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Статус</th>
                <th className="text-left px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Дата</th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((u: any) => (
                <tr key={u.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2 text-ink truncate max-w-[300px]">{u.file_name}</td>
                  <td className="px-4 py-2 text-right tabular text-ink-muted">{u.rows_total}</td>
                  <td className="px-4 py-2 text-right tabular text-ink-muted">
                    {u.brands_approved}/{u.brands_extracted}
                  </td>
                  <td className="px-4 py-2">
                    {u.status === "completed" && <span className="text-lime-deep text-xs font-mono uppercase">готово</span>}
                    {u.status === "processing" && <span className="text-orange text-xs font-mono uppercase">обработка</span>}
                    {u.status === "failed" && (
                      <span className="text-rose text-xs font-mono uppercase" title={u.error_message ?? ""}>
                        ошибка
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-ink-muted text-xs">
                    {new Date(u.created_at).toLocaleDateString("ru-RU")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
