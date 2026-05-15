import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import SyncButton from "./SyncButton";

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
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-lg font-bold text-brand-700">Veloseller</Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/dashboard" className="text-slate-700 hover:text-brand-700">Обзор</Link>
              <Link href="/dashboard/skus" className="text-slate-700 hover:text-brand-700">SKU</Link>
              <Link href="/connections" className="font-semibold text-brand-700">Источники</Link>
            </nav>
          </div>
          <div className="text-sm text-slate-600">{user.email}</div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-slate-900">Источники данных</h1>
          <Link
            href="/connections/new"
            className="rounded-xl bg-brand-700 px-4 py-2 font-semibold text-white hover:bg-brand-600"
          >
            + Подключить источник
          </Link>
        </div>

        <div className="mt-6 space-y-3">
          {connections?.length ? (
            connections.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5">
                <div>
                  <div className="font-semibold text-slate-900">{c.name}</div>
                  <div className="mt-1 text-sm text-slate-600">
                    {sourceLabel(c.source, c.marketplace)} ·{" "}
                    <StatusBadge status={c.status} />
                    {c.last_sync_at && (
                      <span className="ml-2 text-slate-500">
                        синк: {new Date(c.last_sync_at).toLocaleString("ru-RU")}
                      </span>
                    )}
                  </div>
                  {c.last_error && (
                    <div className="mt-2 text-sm text-red-700">{c.last_error}</div>
                  )}
                </div>
                <SyncButton connectionId={c.id} source={c.source} />
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <p className="text-slate-600">Ещё нет подключённых источников.</p>
              <Link
                href="/connections/new"
                className="mt-4 inline-block rounded-xl bg-brand-700 px-6 py-3 font-semibold text-white hover:bg-brand-600"
              >
                Подключить первый источник
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function sourceLabel(source: string, marketplace?: string | null): string {
  if (source === "google_sheet") return "Google Sheet";
  if (source === "csv_upload") return "CSV-загрузка";
  if (source === "marketplace_api") {
    return marketplace === "ozon" ? "Ozon API" : marketplace === "wildberries" ? "Wildberries API" : "Marketplace API";
  }
  return source;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700",
    pending: "bg-slate-100 text-slate-600",
    paused: "bg-amber-50 text-amber-700",
    error: "bg-red-50 text-red-700",
  };
  const labels: Record<string, string> = {
    active: "Активно",
    pending: "Ожидает синка",
    paused: "Приостановлено",
    error: "Ошибка",
  };
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${map[status] ?? "bg-slate-100"}`}>{labels[status] ?? status}</span>;
}
