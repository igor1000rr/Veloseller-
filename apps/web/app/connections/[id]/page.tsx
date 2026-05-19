import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import SyncButton from "../SyncButton";
import DeleteButton from "../DeleteButton";
import { Icons } from "../../_components/Icons";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ConnectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: conn } = await supabase
    .from("data_connections")
    .select("*")
    .eq("id", id)
    .eq("seller_id", user.id)
    .maybeSingle();

  if (!conn) notFound();

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
      <Link href={"/connections" as any} className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-lime-deep transition mb-4">
        <span className="rotate-180"><Icons.ArrowRight size={12} /></span> К источникам
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="size-1 rounded-full bg-lime-deep" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">Source detail</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl tracking-tight font-medium flex items-center gap-3 flex-wrap">
            {conn.name}
            <StatusBadgeFull status={conn.status} />
          </h1>
          <p className="mt-1.5 font-mono text-xs text-ink-hush uppercase tracking-wider">
            {sourceLabel(conn.source, conn.marketplace)} · подключён {new Date(conn.created_at).toLocaleString("ru-RU")}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SyncButton connectionId={conn.id} source={conn.source} />
          <DeleteButton connectionId={conn.id} connectionName={conn.name} variant="full" />
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Snapshots"        value={snapshotsCount ?? 0} />
        <KpiCard label="Уникальных SKU"   value={productIds.size} />
        <KpiCard label="Последний синк"   value={conn.last_sync_at ? new Date(conn.last_sync_at).toLocaleString("ru-RU") : "никогда"} small />
        <KpiCard label="Создан"           value={new Date(conn.created_at).toLocaleString("ru-RU")} small />
      </div>

      {/* Last error */}
      {conn.last_error && (
        <div className="mb-6 rounded-2xl border border-rose/30 bg-rose/5 p-5 md:p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-rose font-semibold">Ошибка последнего синка</span>
          </div>
          <pre className="font-mono text-xs text-rose whitespace-pre-wrap break-all overflow-x-auto">{conn.last_error}</pre>
        </div>
      )}

      {/* Config */}
      <div className="mb-6 rounded-2xl border border-line bg-paper p-5 md:p-6">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-3">Параметры подключения</h2>
        <dl className="grid sm:grid-cols-2 gap-3">
          {Object.entries(conn.config ?? {}).map(([k, v]) => {
            const sensitive = ["client_id", "api_key", "token"].includes(k);
            const display = sensitive && typeof v === "string" && v.length > 0 ? "•••••••• (зашифровано)" : String(v);
            return (
              <div key={k}>
                <dt className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">{k}</dt>
                <dd className="mt-1 font-mono text-sm text-ink break-all">{display}</dd>
              </div>
            );
          })}
          {Object.keys(conn.config ?? {}).length === 0 && (
            <div className="text-sm text-ink-hush col-span-full">Параметры не заданы.</div>
          )}
        </dl>
      </div>

      {/* Recent snapshots */}
      <div className="rounded-2xl border border-line bg-paper p-5 md:p-6">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Последние 20 snapshots</h2>
          <span className="font-mono text-[10px] text-ink-hush">из {snapshotsCount ?? 0} всего</span>
        </div>

        {recentSnapshots && recentSnapshots.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left font-mono text-[10px] uppercase tracking-widest text-ink-hush border-b border-line">
                  <th className="py-2 pr-4">Время</th>
                  <th className="py-2 pr-4">SKU</th>
                  <th className="py-2 pr-4">Товар</th>
                  <th className="py-2 pr-4 text-right">Остаток</th>
                  <th className="py-2 text-right">Цена</th>
                </tr>
              </thead>
              <tbody>
                {recentSnapshots.map((s) => {
                  const p = productById.get(s.product_id);
                  return (
                    <tr key={s.snapshot_id} className="border-b border-line/50 hover:bg-bg-soft transition">
                      <td className="py-2 pr-4 font-mono text-xs text-ink-muted whitespace-nowrap">
                        {new Date(s.snapshot_time).toLocaleString("ru-RU")}
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
          <p className="text-sm text-ink-hush text-center py-6">Ещё нет ни одного снапшота. Нажми «Синхронизировать», чтобы запустить первый.</p>
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

function StatusBadgeFull({ status }: { status: string | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    active:  { label: "активен",       cls: "text-lime-deep border-lime-deep/30 bg-lime-soft" },
    syncing: { label: "синхронизация", cls: "text-azure border-azure/30 bg-azure/10" },
    pending: { label: "ожидание",      cls: "text-ink-hush border-line-2 bg-bg-soft" },
    paused:  { label: "пауза",         cls: "text-ink-hush border-line-2 bg-bg-soft" },
    error:   { label: "ошибка",        cls: "text-rose border-rose/30 bg-rose/10" },
  };
  const s = map[status || ""] || map.paused;
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
