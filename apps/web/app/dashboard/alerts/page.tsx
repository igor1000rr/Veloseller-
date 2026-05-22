import { createSupabaseServerClient } from "@/lib/supabase/server";
import AckButton from "./AckButton";
import BulkAckButton from "./BulkAckButton";
import Link from "next/link";
import { Icons } from "../../_components/Icons";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const KIND_META: Record<string, { label: string; cls: string; tone: "rose" | "orange" | "azure" | "ink" }> = {
  critical_stock:     { label: "Критически мало",   cls: "text-rose border-rose/30 bg-rose/10",       tone: "rose" },
  low_stock:          { label: "Мало",              cls: "text-orange border-orange/30 bg-orange/10", tone: "orange" },
  dead_inventory:     { label: "Неликвид",          cls: "text-ink-soft border-line bg-bg-soft",      tone: "ink" },
  repeated_stockout:  { label: "Регулярный OOS",    cls: "text-orange border-orange/40 bg-orange/15", tone: "orange" },
  underestimated_sku: { label: "Недооценён",       cls: "text-azure border-azure/30 bg-azure/10",   tone: "azure" },
};

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const sp = await searchParams;
  const filterKind = sp.kind;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: allAlerts } = await supabase
    .from("alerts")
    .select("kind,acknowledged_at")
    .eq("seller_id", user.id)
    .is("acknowledged_at", null);

  const byKind: Record<string, number> = {};
  for (const a of allAlerts ?? []) {
    byKind[(a as any).kind] = (byKind[(a as any).kind] ?? 0) + 1;
  }
  const groupedKinds = Object.entries(byKind).sort((a, b) => b[1] - a[1]);
  const totalActive = (allAlerts ?? []).length;

  let listQuery = supabase
    .from("alerts")
    .select("id,kind,message,created_at,acknowledged_at,product_id,payload,products(sku,product_name)")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (filterKind) {
    listQuery = listQuery.eq("kind", filterKind).is("acknowledged_at", null);
  }
  const { data: alerts } = await listQuery;
  const list = alerts ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="size-1 rounded-full bg-lime-deep" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">Alerts</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl tracking-tight font-medium text-ink">Уведомления</h1>
          <p className="text-ink-muted text-sm mt-1">
            {totalActive > 0
              ? <>Активных: <strong className="text-ink">{totalActive}</strong>. Отмечайте выполненные — проблемы уходят из inbox‘а.</>
              : <>Все алерты обработаны.</>
            }
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Ссылка на страницу настройки подписок (правка 11 Александра) */}
          <Link
            href={"/dashboard/alerts/subscriptions" as any}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-line bg-paper text-sm text-ink-muted hover:text-ink hover:bg-bg-soft hover:border-lime-deep/40 transition"
          >
            ⚙ Настроить уведомления
          </Link>
          {totalActive > 0 && <BulkAckButton count={totalActive} />}
        </div>
      </header>

      {groupedKinds.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <Link
            href={"/dashboard/alerts" as any}
            className={`rounded-xl border p-4 hover:shadow-sm transition ${
              !filterKind ? "border-ink bg-bg-soft" : "border-line bg-paper"
            }`}
          >
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">Все</div>
            <div className="font-display text-2xl tabular text-ink font-medium mt-1">{totalActive}</div>
          </Link>
          {groupedKinds.map(([kind, count]) => {
            const meta = KIND_META[kind] ?? { label: kind, cls: "text-ink-soft border-line bg-bg-soft", tone: "ink" as const };
            const active = filterKind === kind;
            return (
              <div
                key={kind}
                className={`rounded-xl border p-4 transition ${
                  active ? "border-ink shadow-sm" : "border-line bg-paper hover:shadow-sm"
                }`}
              >
                <Link href={`/dashboard/alerts?kind=${kind}` as any} className="block">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">{meta.label}</div>
                  <div className="font-display text-2xl tabular text-ink font-medium mt-1">{count}</div>
                </Link>
                <div className="mt-2">
                  <BulkAckButton kind={kind} count={count} kindLabel={meta.label} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {list.length === 0 ? (
        <div className="rounded-2xl border border-line bg-paper p-10 md:p-14 text-center">
          <p className="text-ink-muted text-sm">
            {filterKind ? "Нет алертов этого типа." : "Алертов пока нет — пересчёт ещё не запускался или у SKU нет проблем."}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-paper overflow-hidden">
          <div className="px-4 py-3 bg-bg-soft border-b border-line flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">
              {filterKind ? `Показываем первые ${list.length} «${KIND_META[filterKind]?.label ?? filterKind}»` : `Последние ${list.length} алертов`}
            </span>
            <span className="font-mono text-[10px] text-ink-hush">кликните «Принять» рядом с группой чтобы массово</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-bg-soft border-b border-line">
              <tr>
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Тип</th>
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">SKU</th>
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Сообщение</th>
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Дата</th>
                <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((a: any) => {
                const meta = KIND_META[a.kind] ?? { label: a.kind, cls: "text-ink-soft border-line bg-bg-soft" };
                const product = Array.isArray(a.products) ? a.products[0] : a.products;
                return (
                  <tr key={a.id} className={`hover:bg-bg-soft/50 transition ${a.acknowledged_at ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border font-semibold ${meta.cls}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-ink">{product?.sku ?? "—"}</div>
                      <div className="text-xs text-ink-hush">{product?.product_name ?? ""}</div>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{a.message}</td>
                    <td className="px-4 py-3 text-ink-hush text-xs whitespace-nowrap font-mono">
                      {new Date(a.created_at).toLocaleString("ru-RU")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!a.acknowledged_at && <AckButton id={a.id} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
