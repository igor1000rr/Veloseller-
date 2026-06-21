import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AdminSellersPage({ searchParams }: {
  searchParams: Promise<{ page?: string; plan?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const planFilter = sp.plan ?? "";
  const search = (sp.q ?? "").trim();
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("sellers")
    .select("id,email,display_name,plan,trial_ends_at,timezone,created_at", { count: "exact" });

  if (planFilter) query = query.eq("plan", planFilter);
  if (search) query = query.ilike("email", `%${search}%`);

  const { data: sellers, count } = await query
    .order("created_at", { ascending: false }).range(from, to);

  const sellerIds = (sellers ?? []).map((s: any) => s.id);
  const counts: Record<string, { products: number; alerts: number }> = {};
  for (const id of sellerIds) counts[id] = { products: 0, alerts: 0 };
  if (sellerIds.length > 0) {
    const [{ data: pRows }, { data: aRows }] = await Promise.all([
      supabase.from("products").select("seller_id").in("seller_id", sellerIds),
      supabase.from("alerts").select("seller_id").in("seller_id", sellerIds).is("acknowledged_at", null),
    ]);
    for (const r of pRows ?? []) counts[(r as any).seller_id].products++;
    for (const r of aRows ?? []) counts[(r as any).seller_id].alerts++;
  }

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const pageQuery = (p: number) =>
    `?page=${p}${planFilter ? `&plan=${planFilter}` : ""}${search ? `&q=${encodeURIComponent(search)}` : ""}`;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2">
            <span className="size-1 rounded-full bg-orange" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-orange font-semibold">Admin / Sellers</span>
          </div>
          <h1 className="mt-2 font-display text-3xl md:text-4xl tracking-tight font-medium">Селлеры</h1>
          <p className="mt-1.5 text-ink-muted text-sm">{count ?? 0} аккаунтов</p>
        </div>
        <form className="flex flex-wrap items-center gap-2 text-sm" method="GET">
          <input name="q" defaultValue={search} placeholder="Поиск по email"
                 className="w-full sm:w-56 rounded-lg border border-line bg-bg-soft px-3 py-2 text-ink placeholder:text-ink-hush focus:bg-paper focus:border-lime-deep focus:outline-none transition" />
          <select name="plan" defaultValue={planFilter}
                  className="rounded-lg border border-line bg-bg-soft px-3 py-2 text-ink focus:bg-paper focus:border-lime-deep focus:outline-none transition">
            <option value="">Все планы</option>
            <option value="trial">Trial</option>
            <option value="starter">Starter</option>
            <option value="growth">Growth</option>
            <option value="pro">Pro</option>
          </select>
          <button type="submit" className="rounded-lg bg-ink text-paper px-4 py-2 font-semibold hover:bg-ink-soft transition">
            Найти
          </button>
        </form>
      </header>

      <div className="rounded-2xl border border-line bg-paper overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-bg-soft border-b border-line">
              <tr>
                <Th>Email</Th>
                <Th>Имя</Th>
                <Th>План</Th>
                <Th>Trial до</Th>
                <Th align="right">SKU</Th>
                <Th align="right">Alerts</Th>
                <Th>Регистрация</Th>
                <Th>&nbsp;</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(sellers ?? []).map((s: any) => {
                const c = counts[s.id] || { products: 0, alerts: 0 };
                return (
                  <tr key={s.id} className="hover:bg-bg-soft transition">
                    <td className="px-4 py-3 text-ink font-mono text-xs whitespace-nowrap">{s.email}</td>
                    <td className="px-4 py-3 text-ink-soft">{s.display_name ?? "—"}</td>
                    <td className="px-4 py-3"><PlanBadge plan={s.plan} /></td>
                    <td className="px-4 py-3 text-ink-muted text-xs whitespace-nowrap">
                      {s.trial_ends_at ? new Date(s.trial_ends_at).toLocaleDateString("ru-RU") : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-ink-soft font-medium tabular">{c.products}</td>
                    <td className="px-4 py-3 text-right tabular">
                      {c.alerts > 0 ? <span className="text-orange font-medium">{c.alerts}</span> : <span className="text-ink-hush">0</span>}
                    </td>
                    <td className="px-4 py-3 text-ink-muted text-xs whitespace-nowrap">
                      {new Date(s.created_at).toLocaleString("ru-RU")}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Link href={`/admin/sellers/${s.id}`} className="text-lime-deep hover:text-ink text-xs font-medium transition">
                        Открыть →
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {!sellers?.length && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-ink-hush">Никого не найдено</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-muted">Страница {page} из {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <a href={pageQuery(page - 1)}
                 className="px-3 py-1.5 border border-line rounded-lg hover:border-lime-deep/40 hover:bg-bg-soft transition">← Назад</a>
            )}
            {page < totalPages && (
              <a href={pageQuery(page + 1)}
                 className="px-3 py-1.5 border border-line rounded-lg hover:border-lime-deep/40 hover:bg-bg-soft transition">Вперёд →</a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children, align }: { children?: React.ReactNode; align?: "right" }) {
  return <th className={`px-4 py-2.5 font-mono text-ink-hush text-[10px] uppercase tracking-widest font-semibold whitespace-nowrap ${align === "right" ? "text-right" : "text-left"}`}>{children}</th>;
}

function PlanBadge({ plan }: { plan: string }) {
  const cls = plan === "pro"     ? "bg-lime-deep text-paper"
            : plan === "growth"  ? "bg-lime text-ink"
            : plan === "starter" ? "bg-azure/15 text-azure border border-azure/30"
            :                       "bg-bg-soft text-ink-muted border border-line";
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium font-mono uppercase tracking-widest whitespace-nowrap ${cls}`}>{plan}</span>;
}
