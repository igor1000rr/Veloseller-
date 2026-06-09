import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import SyncButton from "./SyncButton";
import ResumeButton from "./ResumeButton";
import DeleteButton from "./DeleteButton";
import { ConnectionErrorHint } from "./ConnectionErrorHint";
import { parseApiError } from "@/lib/error-parser";
import { Icons } from "../_components/Icons";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LIST_COLUMNS = "id,name,warehouse_kind,source,marketplace,status,last_sync_at,last_error,failure_count,created_at";

export default async function ConnectionsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [connectionsRes, sellerRes] = await Promise.all([
    supabase.from("data_connections").select(LIST_COLUMNS).eq("seller_id", user.id).order("created_at", { ascending: false }),
    supabase.from("sellers").select("plan, plan_warehouses_limit").eq("id", user.id).maybeSingle(),
  ]);
  const connections = connectionsRes.data;
  const limit = sellerRes.data?.plan_warehouses_limit ?? 15;
  const current = connections?.length ?? 0;
  const atLimit = current >= limit;

  const pausedCount = (connections ?? []).filter((c: any) => c.status === "paused").length;

  return (
    <>
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6 md:mb-8">
        <div>
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="size-1 rounded-full bg-lime-deep" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">Warehouses</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl tracking-tight font-medium">Склады</h1>
          <p className="mt-1 text-ink-muted text-sm">
            Данные по каждому складу считаются отдельно и не пересекаются · {current}/{limit} складов
          </p>
        </div>
        {atLimit ? (
          <div className="inline-flex items-center gap-2 rounded-lg border border-orange/30 bg-orange/10 px-4 py-3 text-sm">
            <span className="text-orange font-semibold">Лимит складов достигнут.</span>
            <Link href={"/billing" as any} className="text-orange underline hover:no-underline">
              Обновить тариф →
            </Link>
          </div>
        ) : (
          <Link
            href={"/connections/new" as any}
            className="inline-flex items-center gap-2 rounded-lg bg-ink text-paper px-5 py-3 text-sm font-semibold hover:bg-ink-soft transition"
          >
            <Icons.Plus /> Добавить склад
          </Link>
        )}
      </div>

      {pausedCount > 0 && (
        <div className="mb-5 rounded-xl border border-orange/30 bg-orange/5 p-4 flex items-start gap-3">
          <span className="text-orange mt-0.5 text-lg shrink-0">⛔️</span>
          <div className="flex-1 text-sm">
            <div className="font-medium text-ink">
              {pausedCount === 1 ? "Один склад" : `${pausedCount} склада(ов)`} на авто-паузе
            </div>
            <p className="mt-1 text-ink-muted">
              Sync отключён автоматически после 3 неудач подряд. Проверьте API ключи в деталях склада
              и нажмите <b>Возобновить sync</b>.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {connections?.length ? (
          connections.map((c: any) => {
            const isPaused = c.status === "paused";
            const parsed = c.last_error ? parseApiError(c.last_error) : null;
            return (
              <div key={c.id} className={`rounded-2xl border p-5 md:p-6 hover:shadow-sm transition ${
                isPaused ? "border-orange/40 bg-orange/[0.02]" : "border-line bg-paper"
              }`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/connections/${c.id}` as any}
                      className="inline-flex items-center gap-3 flex-wrap group"
                    >
                      <span className="font-display text-lg font-medium text-ink group-hover:text-lime-deep transition truncate">
                        {c.name}
                      </span>
                      <StatusBadge status={c.status} failureCount={c.failure_count ?? 0} errorKind={parsed?.kind ?? null} />
                      <span className="font-mono text-[10px] text-ink-hush opacity-0 group-hover:opacity-100 transition">
                        детали →
                      </span>
                    </Link>
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap font-mono text-xs text-ink-hush">
                      <span className="uppercase tracking-wider">{warehouseLabel(c.warehouse_kind, c.source, c.marketplace)}</span>
                      {c.last_sync_at ? (
                        <>
                          <span className="size-1 rounded-full bg-line-2" />
                          <span>синк: {new Date(c.last_sync_at).toLocaleString("ru-RU")}</span>
                        </>
                      ) : (
                        <>
                          <span className="size-1 rounded-full bg-line-2" />
                          <span>ещё не синхронизировался</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {isPaused ? (
                      <ResumeButton connectionId={c.id} />
                    ) : (
                      <SyncButton
                        connectionId={c.id}
                        source={c.source}
                        warehouseKind={c.warehouse_kind}
                        marketplace={c.marketplace}
                        lastError={c.last_error}
                        lastSyncAt={c.last_sync_at}
                      />
                    )}
                    <DeleteButton connectionId={c.id} connectionName={c.name} variant="compact" />
                  </div>
                </div>
                {parsed && <ConnectionErrorHint parsed={parsed} />}
              </div>
            );
          })
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-line-2 bg-paper p-10 md:p-14 text-center">
            <div className="size-12 mx-auto rounded-full bg-lime-soft flex items-center justify-center text-lime-deep mb-4">
              <Icons.Plug />
            </div>
            <p className="font-display text-xl md:text-2xl text-ink font-medium">Ещё нет подключённых складов</p>
            <p className="mt-2 text-ink-muted text-sm max-w-md mx-auto">
              Подключите Ozon FBO/FBS, Wildberries или Google Sheet — каждый источник станет отдельным складом с собственной аналитикой.
            </p>
            <Link
              href={"/connections/new" as any}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-ink text-paper px-6 py-3 text-sm font-semibold hover:bg-ink-soft transition"
            >
              Добавить первый склад <Icons.ArrowRight />
            </Link>
          </div>
        )}
      </div>
    </>
  );
}

function StatusBadge({ status, failureCount, errorKind }: { status: string | null; failureCount: number; errorKind?: string | null }) {
  // Временные сбои (лимит API / МП лежит / нет сети) показываем мягким янтарным
  // тоном — это «подожди», а не «поломка». Жёсткий красный остаётся для реальных ошибок.
  const TRANSIENT: Record<string, string> = { rate_limit: "лимит API", marketplace_down: "МП недоступен", network: "нет связи" };
  const map: Record<string, { label: string; cls: string }> = {
    active:   { label: "активен",     cls: "text-lime-deep border-lime-deep/30 bg-lime-soft" },
    syncing:  { label: "синхронизация", cls: "text-azure border-azure/30 bg-azure/10" },
    pending:  { label: "ожидание",    cls: "text-ink-hush border-line-2 bg-bg-soft" },
    paused:   { label: "авто-пауза",  cls: "text-orange border-orange/40 bg-orange/10 font-bold" },
    error:    { label: "ошибка",      cls: "text-rose border-rose/30 bg-rose/10" },
  };
  let s = map[status || ""] || map.pending;
  if (status === "error" && errorKind && TRANSIENT[errorKind]) {
    s = { label: TRANSIENT[errorKind], cls: "text-orange border-orange/40 bg-orange/10" };
  }
  const showCount = (status === "error" || status === "paused") && failureCount > 0;
  return (
    <span className={`inline-flex items-center font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border font-semibold ${s.cls}`}>
      {s.label}{showCount && ` · ${failureCount}/3`}
    </span>
  );
}

/** Отображаемое название типа склада. Приоритет warehouse_kind над legacy source/marketplace. */
function warehouseLabel(warehouseKind: string | null, source: string, marketplace: string | null): string {
  if (warehouseKind) {
    return {
      ozon_fbo:     "Ozon FBO",
      ozon_fbs:     "Ozon FBS",
      wb_fbo:       "Wildberries FBO",
      wb_fbs:       "Wildberries FBS",
      google_sheet: "Google Sheet",
    }[warehouseKind] || warehouseKind;
  }
  if (source === "csv_upload") return "CSV upload";
  if (source === "google_sheet") return "Google Sheet";
  if (source === "feed") return "YML feed";
  if (source === "marketplace_api") {
    return {
      ozon: "Ozon API",
      wildberries: "Wildberries API",
      shopify: "Shopify",
      amazon: "Amazon SP-API",
    }[marketplace || ""] || "Marketplace API";
  }
  return source;
}
