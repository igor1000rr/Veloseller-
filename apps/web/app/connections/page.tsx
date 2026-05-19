import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import SyncButton from "./SyncButton";
import DeleteButton from "./DeleteButton";
import { Icons } from "../_components/Icons";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ConnectionsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: connections } = await supabase
    .from("data_connections")
    .select("*")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <>
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6 md:mb-8">
        <div>
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="size-1 rounded-full bg-lime-deep" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">Sources</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl tracking-tight font-medium">Источники данных</h1>
          <p className="mt-1 text-ink-muted text-sm">Подключённые маркетплейсы и файлы — read-only</p>
        </div>
        <Link
          href={"/connections/new" as any}
          className="inline-flex items-center gap-2 rounded-lg bg-ink text-paper px-5 py-3 text-sm font-semibold hover:bg-ink-soft transition"
        >
          <Icons.Plus /> Подключить источник
        </Link>
      </div>

      <div className="space-y-3">
        {connections?.length ? (
          connections.map((c) => (
            <div key={c.id} className="rounded-2xl border border-line bg-paper p-5 md:p-6 hover:shadow-sm transition">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/connections/${c.id}` as any}
                    className="inline-flex items-center gap-3 flex-wrap group"
                  >
                    <span className="font-display text-lg font-medium text-ink group-hover:text-lime-deep transition truncate">
                      {c.name}
                    </span>
                    <StatusBadge status={c.status} />
                    <span className="font-mono text-[10px] text-ink-hush opacity-0 group-hover:opacity-100 transition">
                      детали →
                    </span>
                  </Link>
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap font-mono text-xs text-ink-hush">
                    <span className="uppercase tracking-wider">{sourceLabel(c.source, c.marketplace)}</span>
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
                  <SyncButton connectionId={c.id} source={c.source} />
                  <DeleteButton connectionId={c.id} connectionName={c.name} variant="compact" />
                </div>
              </div>
              {c.last_error && (
                <details className="mt-3 group">
                  <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-rose hover:opacity-80 transition select-none">
                    Текст последней ошибки
                  </summary>
                  <pre className="mt-2 p-3 bg-rose/5 border border-rose/20 rounded text-[11px] text-rose font-mono overflow-x-auto whitespace-pre-wrap break-all">
                    {c.last_error}
                  </pre>
                </details>
              )}
            </div>
          ))
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-line-2 bg-paper p-10 md:p-14 text-center">
            <div className="size-12 mx-auto rounded-full bg-lime-soft flex items-center justify-center text-lime-deep mb-4">
              <Icons.Plug />
            </div>
            <p className="font-display text-xl md:text-2xl text-ink font-medium">Ещё нет подключённых источников</p>
            <p className="mt-2 text-ink-muted text-sm max-w-md mx-auto">Самый быстрый способ начать — Google Sheet или CSV. Для боёвых маркетплейсов выдай read-only API ключ.</p>
            <Link
              href={"/connections/new" as any}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-ink text-paper px-6 py-3 text-sm font-semibold hover:bg-ink-soft transition"
            >
              Подключить первый источник <Icons.ArrowRight />
            </Link>
          </div>
        )}
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    active:   { label: "активен",     cls: "text-lime-deep border-lime-deep/30 bg-lime-soft" },
    syncing:  { label: "синхронизация", cls: "text-azure border-azure/30 bg-azure/10" },
    pending:  { label: "ожидание",    cls: "text-ink-hush border-line-2 bg-bg-soft" },
    paused:   { label: "пауза",       cls: "text-ink-hush border-line-2 bg-bg-soft" },
    error:    { label: "ошибка",      cls: "text-rose border-rose/30 bg-rose/10" },
  };
  const s = map[status || ""] || map.paused;
  return (
    <span className={`inline-flex items-center font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border font-semibold ${s.cls}`}>
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
