import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import SyncButton from "../SyncButton";
import DeleteButton from "../DeleteButton";
import RenameConnection from "../RenameConnection";
import { ConnectionErrorHint } from "../ConnectionErrorHint";
import { parseApiError } from "@/lib/error-parser";
import { Icons } from "../../_components/Icons";
import { t } from "@/lib/i18n";
import { LOCALE } from "@/lib/features";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LOC = LOCALE === "ru" ? "ru-RU" : "en-US";

// БАГ 73: фильтруем sensitive поля из config перед отдачей в HTML
const SENSITIVE_CONFIG_KEYS = new Set(["api_key", "token", "client_id", "password", "secret"]);

const TRANSIENT_KINDS = ["rate_limit", "marketplace_down", "network"];

function safeConfig(config: Record<string, any> | null): Record<string, string> {
  if (!config) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(config)) {
    if (SENSITIVE_CONFIG_KEYS.has(k)) {
      // Не отдаём даже зашифрованный текст — показываем флаг
      const hasValue = typeof v === "string" && v.length > 0;
      out[k] = hasValue ? t("connections.configMasked") : t("connections.configNotSet");
    } else {
      out[k] = String(v);
    }
  }
  return out;
}

export default async function ConnectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // БАГ 73: явно выбираем колонки + config отдельно для фильтрации
  const { data: conn } = await supabase
    .from("data_connections")
    .select("id,name,source,marketplace,warehouse_kind,status,last_sync_at,last_error,created_at,config")
    .eq("id", id)
    .eq("seller_id", user.id)
    .maybeSingle();

  if (!conn) notFound();

  // Фильтруем config — sensitive поля заменяем на маски
  const displayConfig = safeConfig(conn.config as Record<string, any> | null);

  // Сырой last_error превращаем в человеческую подсказку (как на списке складов)
  const parsed = conn.last_error ? parseApiError(conn.last_error) : null;
  const autoRetry = !!parsed && TRANSIENT_KINDS.includes(parsed.kind) && conn.status !== "paused";

  // Количество snapshots от этой connection (история синков)
  const { count: snapshotsCount } = await supabase
    .from("inventory_snapshots")
    .select("snapshot_id", { count: "exact", head: true })
    .eq("connection_id", id);

  // Последние 20 snapshots — для лога
  const { data: recentSnapshots } = await supabase
    .from("inventory_snapshots")
    .select("snapshot_id, snapshot_time, stock_quantity, price, product_id")
    .eq("connection_id", id)
    .order("snapshot_time", { ascending: false })
    .limit(20);

  // Уникальных SKU
  const productIds = new Set((recentSnapshots ?? []).map((s) => s.product_id));
  const { data: products } = productIds.size > 0
    ? await supabase.from("products").select("product_id, sku, product_name").in("product_id", Array.from(productIds))
    : { data: [] };
  const productById = new Map((products ?? []).map((p) => [p.product_id, p]));

  return (
    <>
      <Link href={"/connections"} className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-lime-deep transition mb-4">
        <span className="rotate-180"><Icons.ArrowRight size={12} /></span> {t("connections.backToSources")}
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="size-1 rounded-full bg-lime-deep" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">Source detail</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl tracking-tight font-medium flex items-center gap-3 flex-wrap">
            <RenameConnection connectionId={conn.id} currentName={conn.name} />
            <StatusBadgeFull status={conn.status} errorKind={parsed?.kind ?? null} />
          </h1>
          <p className="mt-1.5 font-mono text-xs text-ink-hush uppercase tracking-wider">
            {sourceLabel(conn.source, conn.marketplace)} · {t("connections.connectedAt", { date: new Date(conn.created_at).toLocaleString(LOC) })}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SyncButton
            connectionId={conn.id}
            source={conn.source}
            warehouseKind={conn.warehouse_kind}
            marketplace={conn.marketplace}
            lastError={conn.last_error}
            lastSyncAt={conn.last_sync_at}
          />
          <DeleteButton connectionId={conn.id} connectionName={conn.name} variant="full" />
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Snapshots"        value={snapshotsCount ?? 0} />
        <KpiCard label={t("connections.kpi.uniqueSku")}   value={productIds.size} />
        <KpiCard label={t("connections.kpi.lastSync")}   value={conn.last_sync_at ? new Date(conn.last_sync_at).toLocaleString(LOC) : t("connections.never")} small />
        <KpiCard label={t("connections.kpi.created")}           value={new Date(conn.created_at).toLocaleString(LOC)} small />
      </div>

      {/* Подсказка по последней ошибке синка */}
      {parsed && <ConnectionErrorHint parsed={parsed} className="mb-6" autoRetry={autoRetry} />}

      {/* Config (с замаскированными sensitive значениями) */}
      <div className="mb-6 rounded-2xl border border-line bg-paper p-5 md:p-6">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-3">{t("connections.configTitle")}</h2>
        <dl className="grid sm:grid-cols-2 gap-3">
          {Object.entries(displayConfig).map(([k, v]) => (
            <div key={k}>
              <dt className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">{k}</dt>
              <dd className="mt-1 font-mono text-sm text-ink break-all">{v}</dd>
            </div>
          ))}
          {Object.keys(displayConfig).length === 0 && (
            <div className="text-sm text-ink-hush col-span-full">{t("connections.configEmpty")}</div>
          )}
        </dl>
      </div>

      {/* Recent snapshots */}
      <div className="rounded-2xl border border-line bg-paper p-5 md:p-6">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">{t("connections.recentSnapshots")}</h2>
          <span className="font-mono text-[10px] text-ink-hush">{t("connections.ofTotal", { n: snapshotsCount ?? 0 })}</span>
        </div>

        {recentSnapshots && recentSnapshots.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left font-mono text-[10px] uppercase tracking-widest text-ink-hush border-b border-line">
                  <th className="py-2 pr-4">{t("connections.col.time")}</th>
                  <th className="py-2 pr-4">SKU</th>
                  <th className="py-2 pr-4">{t("connections.col.product")}</th>
                  <th className="py-2 pr-4 text-right">{t("connections.col.stock")}</th>
                  <th className="py-2 text-right">{t("connections.col.price")}</th>
                </tr>
              </thead>
              <tbody>
                {recentSnapshots.map((s) => {
                  const p = productById.get(s.product_id);
                  return (
                    <tr key={s.snapshot_id} className="border-b border-line/50 hover:bg-bg-soft transition">
                      <td className="py-2 pr-4 font-mono text-xs text-ink-muted whitespace-nowrap">
                        {new Date(s.snapshot_time).toLocaleString(LOC)}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs text-ink">{p?.sku ?? "—"}</td>
                      <td className="py-2 pr-4 text-ink-soft truncate max-w-xs">{p?.product_name ?? "—"}</td>
                      <td className="py-2 pr-4 text-right tabular text-ink">{s.stock_quantity}</td>
                      <td className="py-2 text-right tabular text-ink-soft">{Number(s.price).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-ink-hush text-center py-6">{t("connections.snapshotsEmpty")}</p>
        )}
      </div>
    </>
  );
}

function KpiCard({ label, value, small }: { label: string; value: React.ReactNode; small?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">{label}</div>
      <div className={`mt-1.5 font-display tabular font-medium text-ink ${small ? "text-sm" : "text-2xl md:text-3xl"}`}>
        {value}
      </div>
    </div>
  );
}

function StatusBadgeFull({ status, errorKind }: { status: string | null; errorKind?: string | null }) {
  const TRANSIENT: Record<string, string> = {
    rate_limit: t("connections.transient.rateLimit"),
    marketplace_down: t("connections.transient.marketplaceDown"),
    network: t("connections.transient.network"),
  };
  const map: Record<string, { label: string; cls: string }> = {
    active:  { label: t("connections.status.active"),       cls: "text-lime-deep border-lime-deep/30 bg-lime-soft" },
    syncing: { label: t("connections.status.syncing"), cls: "text-azure border-azure/30 bg-azure/10" },
    pending: { label: t("connections.status.pending"),      cls: "text-ink-hush border-line-2 bg-bg-soft" },
    paused:  { label: t("connections.status.pausedShort"),         cls: "text-ink-hush border-line-2 bg-bg-soft" },
    error:   { label: t("connections.status.error"),        cls: "text-rose border-rose/30 bg-rose/10" },
  };
  let s = map[status || ""] || map.paused;
  if (status === "error" && errorKind && TRANSIENT[errorKind]) {
    s = { label: TRANSIENT[errorKind], cls: "text-orange border-orange/40 bg-orange/10" };
  }
  return (
    <span className={`inline-flex items-center font-mono text-[10px] uppercase tracking-widest px-2.5 py-1 rounded border font-semibold ${s.cls}`}>
      {s.label}
    </span>
  );
}

function sourceLabel(source: string, marketplace: string | null): string {
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
