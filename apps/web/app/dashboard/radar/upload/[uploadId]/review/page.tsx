import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import BrandReviewTable from "./BrandReviewTable";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Страница ревью извлечённых брендов после загрузки прайса.
 * Worker обработал → AI вернул список → юзер ставит галочки.
 *
 * Workflow:
 * - status=processing → анимация ожидания, авто-refresh через JS
 * - status=failed     → ошибка + кнопка попробовать снова
 * - status=completed  → таблица BrandReviewTable с галочками для approval
 *
 * Бренды загружаем не по upload_id (т.к. их связь через source=ai +
 * created_at в окне upload'а), а как все ai-бренды селлера которые
 * попадают в окно [upload.created_at - 5min, upload.completed_at + 5min].
 * Если есть completed_at — берём по нему, иначе по created_at.
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

  // Если processing — параллельно подгрузим лимит для будущего ревью
  const [{ data: seller }] = await Promise.all([
    sb.from("sellers")
      .select("radar_brands_limit, radar_plan")
      .eq("id", user.id)
      .maybeSingle(),
  ]);
  const brandsLimit = seller?.radar_brands_limit ?? 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link href={"/dashboard/radar/upload" as any} className="font-mono text-[11px] uppercase tracking-wider text-ink-hush hover:text-ink transition mb-2 inline-block">
          ← К загрузкам
        </Link>
        <h1 className="font-display text-2xl sm:text-3xl font-medium tracking-tight text-ink">
          {upload.file_name}
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          Загружено {new Date(upload.created_at).toLocaleString("ru-RU")}
          {upload.rows_total > 0 && <span> · {upload.rows_total} строк</span>}
        </p>
      </div>

      {upload.status === "processing" && <ProcessingBlock uploadId={uploadId} />}
      {upload.status === "failed" && <FailedBlock errorMessage={upload.error_message} />}
      {upload.status === "completed" && (
        <CompletedBlock
          uploadId={uploadId}
          upload={upload}
          sellerId={user.id}
          brandsLimit={brandsLimit}
          sb={sb}
        />
      )}
    </div>
  );
}

function ProcessingBlock({ uploadId }: { uploadId: string }) {
  return (
    <div className="rounded-2xl border border-azure/30 bg-azure/5 p-8 text-center">
      <div className="inline-flex items-center gap-3 mb-3">
        <span className="inline-block size-2 rounded-full bg-azure animate-pulse" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-azure font-semibold">Обрабатываем</span>
      </div>
      <h3 className="font-display text-xl font-medium text-ink">ИИ извлекает бренды</h3>
      <p className="mt-2 text-sm text-ink-muted max-w-md mx-auto">
        Обычно занимает 30-60 секунд. Страница обновится автоматически
        когда обработка завершится.
      </p>
      <div className="mt-4 text-xs text-ink-hush font-mono">
        Upload ID: {uploadId}
      </div>
      {/* Авто-refresh раз в 5 секунд пока processing.
         После completed/failed страница перерендерится без авто-refresh. */}
      <meta httpEquiv="refresh" content="5" />
    </div>
  );
}

function FailedBlock({ errorMessage }: { errorMessage: string | null }) {
  return (
    <div className="rounded-2xl border border-rose/30 bg-rose/5 p-6">
      <h3 className="font-display text-lg font-medium text-rose">Ошибка обработки</h3>
      <p className="mt-2 text-sm text-ink">
        {errorMessage ?? "Не удалось обработать файл"}
      </p>
      <Link
        href={"/dashboard/radar/upload" as any}
        className="mt-4 inline-flex items-center rounded-lg border border-line bg-paper px-4 py-2 text-sm font-medium text-ink hover:border-lime-deep/40 transition"
      >
        Попробовать снова
      </Link>
    </div>
  );
}

async function CompletedBlock({
  uploadId,
  upload,
  sellerId,
  brandsLimit,
  sb,
}: {
  uploadId: string;
  upload: any;
  sellerId: string;
  brandsLimit: number;
  sb: any;
}) {
  // Бренды из этого upload: source=ai в окне ±5 минут от completed_at
  const completedAt = upload.completed_at || upload.created_at;
  const windowStart = new Date(new Date(upload.created_at).getTime() - 5 * 60_000).toISOString();
  const windowEnd = new Date(new Date(completedAt).getTime() + 5 * 60_000).toISOString();

  const { data: brands } = await sb
    .from("radar_brands")
    .select("id, name, status, sku_count, avg_price")
    .eq("seller_id", sellerId)
    .eq("source", "ai")
    .gte("created_at", windowStart)
    .lte("created_at", windowEnd)
    .order("sku_count", { ascending: false });

  const brandsArr = brands ?? [];

  // Сколько approved у селлера ВНЕ этого upload (другие источники)
  const brandIdsInThisUpload = brandsArr.map((b: any) => b.id);
  let otherApprovedCount = 0;
  if (brandIdsInThisUpload.length > 0) {
    const { count } = await sb
      .from("radar_brands")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", sellerId)
      .eq("status", "approved")
      .not("id", "in", `(${brandIdsInThisUpload.join(",")})`);
    otherApprovedCount = count ?? 0;
  } else {
    const { count } = await sb
      .from("radar_brands")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", sellerId)
      .eq("status", "approved");
    otherApprovedCount = count ?? 0;
  }

  if (brandsArr.length === 0) {
    return (
      <div className="rounded-2xl border border-orange/30 bg-orange/5 p-6">
        <h3 className="font-display text-lg font-medium text-orange">Бренды не найдены</h3>
        <p className="mt-2 text-sm text-ink">
          ИИ обработал файл, но не смог выделить ни одного бренда. Проверьте
          что в прайсе есть колонка с производителем/брендом, или добавьте
          бренды вручную.
        </p>
        <Link
          href={"/dashboard/radar/brands" as any}
          className="mt-4 inline-flex items-center rounded-lg bg-ink text-paper px-4 py-2 text-sm font-medium hover:bg-ink-soft transition"
        >
          Добавить вручную
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-lime-deep/30 bg-lime-soft/40 p-5">
        <h3 className="font-display text-lg font-medium text-lime-deep">
          ИИ нашёл {brandsArr.length} брендов
        </h3>
        <p className="mt-2 text-sm text-ink leading-relaxed">
          Поставьте галочки на те бренды по которым хотите получать сигналы.
          Можете снять лишние, добавить остальные позже руками. Лимит вашего
          тарифа — {brandsLimit} брендов.
          {upload.ai_cost_usd > 0 && (
            <span className="text-ink-hush text-xs ml-2">
              · обработка {upload.ai_model || "ai"} обошлась в ${upload.ai_cost_usd.toFixed(4)}
            </span>
          )}
        </p>
      </div>

      <BrandReviewTable
        brands={brandsArr}
        brandsLimit={brandsLimit}
        otherApprovedCount={otherApprovedCount}
      />
    </div>
  );
}
