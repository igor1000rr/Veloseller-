import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Страница ревью извлечённых брендов после загрузки прайса.
 * Worker обработал → AI вернул список → юзер ставит галочки.
 *
 * Пока что (без AI-интеграции) показывает только статус upload'а:
 * processing / completed / failed. После подключения OpenRouter
 * здесь будет таблица с галочками для approval.
 */
export default async function ReviewPage({ params }: {
  params: Promise<{ uploadId: string }>;
}) {
  const { uploadId } = await params;

  const sb = await createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: upload } = await sb
    .from("radar_price_uploads")
    .select("*")
    .eq("id", uploadId)
    .eq("seller_id", user.id)
    .maybeSingle();

  if (!upload) notFound();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link href={"/dashboard/radar/upload" as any} className="font-mono text-[11px] uppercase tracking-wider text-ink-hush hover:text-ink transition mb-2 inline-block">
          ← К загрузкам
        </Link>
        <h1 className="font-display text-2xl sm:text-3xl font-medium tracking-tight text-ink">
          {upload.file_name}
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          Загружено {new Date(upload.created_at).toLocaleString("ru-RU")}
        </p>
      </div>

      {upload.status === "processing" && (
        <div className="rounded-2xl border border-azure/30 bg-azure/5 p-8 text-center">
          <div className="inline-flex items-center gap-3 mb-3">
            <span className="inline-block size-2 rounded-full bg-azure animate-pulse" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-azure font-semibold">Обрабатываем</span>
          </div>
          <h3 className="font-display text-xl font-medium text-ink">ИИ извлекает бренды</h3>
          <p className="mt-2 text-sm text-ink-muted max-w-md mx-auto">
            Обычно занимает 30-60 секунд. Обновите страницу или подождите —
            результат появится автоматически.
          </p>
          <div className="mt-4 text-xs text-ink-hush font-mono">
            Upload ID: {uploadId}
          </div>
        </div>
      )}

      {upload.status === "failed" && (
        <div className="rounded-2xl border border-rose/30 bg-rose/5 p-6">
          <h3 className="font-display text-lg font-medium text-rose">Ошибка обработки</h3>
          <p className="mt-2 text-sm text-ink">
            {upload.error_message ?? "Не удалось обработать файл"}
          </p>
          <Link
            href={"/dashboard/radar/upload" as any}
            className="mt-4 inline-flex items-center rounded-lg border border-line bg-paper px-4 py-2 text-sm font-medium text-ink hover:border-lime-deep/40 transition"
          >
            Попробовать снова
          </Link>
        </div>
      )}

      {upload.status === "completed" && (
        <div className="rounded-2xl border border-lime-deep/30 bg-lime-soft/40 p-6">
          <h3 className="font-display text-lg font-medium text-lime-deep">
            Извлечено {upload.brands_extracted} брендов
          </h3>
          <p className="mt-2 text-sm text-ink">
            Из {upload.rows_total} строк прайса. Перейдите к управлению брендами
            чтобы убрать ненужные и подтвердить список.
          </p>
          <Link
            href={"/dashboard/radar/brands" as any}
            className="mt-4 inline-flex items-center rounded-lg bg-ink text-paper px-4 py-2 text-sm font-medium hover:bg-ink-soft transition"
          >
            Управление брендами →
          </Link>
        </div>
      )}
    </div>
  );
}
