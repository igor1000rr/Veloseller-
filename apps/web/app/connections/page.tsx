import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import SyncButton from "./SyncButton";
import ResumeButton from "./ResumeButton";
import DeleteButton from "./DeleteButton";
import { ConnectionErrorHint } from "./ConnectionErrorHint";
import { parseApiError } from "@/lib/error-parser";
import { Icons } from "../_components/Icons";
import { t, plural } from "@/lib/i18n";
import { LOCALE } from "@/lib/features";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LOC = LOCALE === "ru" ? "ru-RU" : "en-US";

const LIST_COLUMNS = "id,name,warehouse_kind,source,marketplace,status,last_sync_at,last_error,failure_count,created_at";

const TRANSIENT_KINDS = ["rate_limit", "marketplace_down", "network"];

export default async function ConnectionsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [connectionsRes, sellerRes, covRes] = await Promise.all([
    supabase.from("data_connections").select(LIST_COLUMNS).eq("seller_id", user.id).order("created_at", { ascending: false }),
    supabase.from("sellers").select("plan, plan_warehouses_limit").eq("id", user.id).maybeSingle(),
    // Покрытие ценами по WB-складам. RPC новая — ещё не в сген. типах БД, поэтому cast.
    (supabase.rpc as any)("wb_price_coverage"),
  ]);
  const connections = connectionsRes.data;
  // Если у WB-склада есть остатки, но почти нет цен — у токена нет категории
  // «Цены и скидки» (WB не отдаёт цены) → «заморожено»/потери = 0. Подсказываем.
  const priceCoverage = new Map<string, { stocked: number; priced: number }>(
    (((covRes as any)?.data as any[]) ?? []).map((r) => [
      r.connection_id as string,
      { stocked: Number(r.stocked) || 0, priced: Number(r.stocked_priced) || 0 },
    ]),
  );
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
          <h1 className="font-display text-3xl md:text-4xl tracking-tight font-medium">{t("connections.title")}</h1>
          <p className="mt-1 text-ink-muted text-sm">
            {t("connections.subtitle", { current, limit })}
          </p>
        </div>
        {atLimit ? (
          <div className="inline-flex items-center gap-2 rounded-lg border border-orange/30 bg-orange/10 px-4 py-3 text-sm">
            <span className="text-orange font-semibold">{t("connections.limitReached")}</span>
            <Link href={"/billing"} className="text-orange underline hover:no-underline">
              {t("connections.upgradePlan")} →
            </Link>
          </div>
        ) : (
          <Link
            href={"/connections/new"}
            className="inline-flex items-center gap-2 rounded-lg bg-ink text-paper px-5 py-3 text-sm font-semibold hover:bg-ink-soft transition"
          >
            <Icons.Plus /> {t("connections.addWarehouse")}
          </Link>
        )}
      </div>

      {pausedCount > 0 && (
        <div className="mb-5 rounded-xl border border-orange/30 bg-orange/5 p-4 flex items-start gap-3">
          <span className="text-orange mt-0.5 text-lg shrink-0">⛔️</span>
          <div className="flex-1 text-sm">
            <div className="font-medium text-ink">
              {pausedCount} {plural(pausedCount, "connections.warehousePlural")} {t("connections.pausedSuffix")}
            </div>
            <p className="mt-1 text-ink-muted">
              {t("connections.pausedBodyPre")} <b>{t("connections.resumeSync")}</b>.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {connections?.length ? (
          connections.map((c: any) => {
            const isPaused = c.status === "paused";
            const parsed = c.last_error ? parseApiError(c.last_error) : null;
            const autoRetry = !!parsed && TRANSIENT_KINDS.includes(parsed.kind) && c.status !== "paused";
            const cov = priceCoverage.get(c.id);
            // Подсказка о цене: есть остатки (≥5), но <10% из них с ценой.
            const lowPrice = !!cov && cov.stocked >= 5 && cov.priced / cov.stocked < 0.1;
            return (
              <div key={c.id} className={`rounded-2xl border p-5 md:p-6 hover:shadow-sm transition ${
                isPaused ? "border-orange/40 bg-orange/[0.02]" : "border-line bg-paper"
              }`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/connections/${c.id}`}
                      className="inline-flex items-center gap-3 flex-wrap group"
                    >
                      <span className="font-display text-lg font-medium text-ink group-hover:text-lime-deep transition truncate">
                        {c.name}
                      </span>
                      <StatusBadge status={c.status} failureCount={c.failure_count ?? 0} errorKind={parsed?.kind ?? null} />
                      <span className="font-mono text-[10px] text-ink-hush opacity-0 group-hover:opacity-100 transition">
                        {t("connections.details")} →
                      </span>
                    </Link>
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap font-mono text-xs text-ink-hush">
                      <span className="uppercase tracking-wider">{warehouseLabel(c.warehouse_kind, c.source, c.marketplace)}</span>
                      {c.last_sync_at ? (
                        <>
                          <span className="size-1 rounded-full bg-line-2" />
                          <span>{t("connections.syncedAt", { date: new Date(c.last_sync_at).toLocaleString(LOC) })}</span>
                        </>
                      ) : (
                        <>
                          <span className="size-1 rounded-full bg-line-2" />
                          <span>{t("connections.neverSynced")}</span>
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
                {parsed && <ConnectionErrorHint parsed={parsed} autoRetry={autoRetry} />}
                {lowPrice && cov && (
                  <PriceCoverageHint unpriced={cov.stocked - cov.priced} stocked={cov.stocked} href={`/connections/${c.id}`} />
                )}
              </div>
            );
          })
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-line-2 bg-paper p-10 md:p-14 text-center">
            <div className="size-12 mx-auto rounded-full bg-lime-soft flex items-center justify-center text-lime-deep mb-4">
              <Icons.Plug />
            </div>
            <p className="font-display text-xl md:text-2xl text-ink font-medium">{t("connections.emptyTitle")}</p>
            <p className="mt-2 text-ink-muted text-sm max-w-md mx-auto">
              {t("connections.emptyDesc")}
            </p>
            <Link
              href={"/connections/new"}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-ink text-paper px-6 py-3 text-sm font-semibold hover:bg-ink-soft transition"
            >
              {t("connections.addFirstWarehouse")} <Icons.ArrowRight />
            </Link>
          </div>
        )}
      </div>
    </>
  );
}

/** Подсказка: у WB-склада есть остатки, но нет цен → токен без категории «Цены и скидки». */
function PriceCoverageHint({ unpriced, stocked, href }: { unpriced: number; stocked: number; href: string }) {
  return (
    <div className="mt-3 rounded-xl border border-orange/30 bg-orange/5 p-4 flex items-start gap-2.5">
      <span className="text-base leading-none mt-0.5 shrink-0">🔑</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-orange">{t("connections.priceHint.title")}</div>
        <p className="mt-1 text-sm text-ink-soft">{t("connections.priceHint.body", { unpriced, stocked })}</p>
        <Link href={href} className="mt-2 inline-block text-sm font-semibold text-ink underline hover:no-underline">
          {t("connections.priceHint.action")} →
        </Link>
      </div>
    </div>
  );
}

function StatusBadge({ status, failureCount, errorKind }: { status: string | null; failureCount: number; errorKind?: string | null }) {
  // Временные сбои (лимит API / МП лежит / нет сети) показываем мягким янтарным
  // тоном — это «подожди», а не «поломка». Жёсткий красный остаётся для реальных ошибок.
  const TRANSIENT: Record<string, string> = {
    rate_limit: t("connections.transient.rateLimit"),
    marketplace_down: t("connections.transient.marketplaceDown"),
    network: t("connections.transient.network"),
  };
  const map: Record<string, { label: string; cls: string }> = {
    active:   { label: t("connections.status.active"),   cls: "text-lime-deep border-lime-deep/30 bg-lime-soft" },
    syncing:  { label: t("connections.status.syncing"),  cls: "text-azure border-azure/30 bg-azure/10" },
    pending:  { label: t("connections.status.pending"),  cls: "text-ink-hush border-line-2 bg-bg-soft" },
    paused:   { label: t("connections.status.paused"),   cls: "text-orange border-orange/40 bg-orange/10 font-bold" },
    error:    { label: t("connections.status.error"),    cls: "text-rose border-rose/30 bg-rose/10" },
  };
  let s = map[status || ""] || map.pending;
  const isTransient = status === "error" && !!errorKind && !!TRANSIENT[errorKind];
  if (isTransient) {
    s = { label: TRANSIENT[errorKind!], cls: "text-orange border-orange/40 bg-orange/10" };
  }
  // Счётчик "N/3" показываем только там, где порог авто-паузы реально действует:
  // paused или НЕ-транзиентная ошибка. Транзиентные (лимит API / МП лежит / сеть)
  // после фикса воркера НЕ паузятся на 3 — для них "14/3" вводил бы в заблуждение.
  const showCount = (status === "paused" || (status === "error" && !isTransient)) && failureCount > 0;
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
      shopify:      "Shopify",
      csv:          "CSV-файл",
      manual:       "Ручной режим",
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
