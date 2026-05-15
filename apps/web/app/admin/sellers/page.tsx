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
  const counts: Record<string, { products: number; alerts: number; snapshots: number }> = {};
  for (const id of sellerIds) counts[id] = { products: 0, alerts: 0, snapshots: 0 };
  if (sellerIds.length > 0) {
    const [{ data: pRows }, { data: aRows }] = await Promise.all([
      supabase.from("products").select("seller_id").in("seller_id", sellerIds),
      supabase.from("alerts").select("seller_id").in("seller_id", sellerIds).is("acknowledged_at", null),
    ]);
    for (const r of pRows ?? []) counts[(r as any).seller_id].products++;
    for (const r of aRows ?? []) counts[(r as any).seller_id].alerts++;
  }

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Селлеры</h1>
          <p className="text-sm text-slate-500 mt-1">{count ?? 0} аккаунтов</p>
        </div>
        <form className="flex gap-2 text-sm" method="GET">
          <input name="q" defaultValue={search} placeholder="Поиск по email"
                 className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 w-56" />
          <select name="plan" defaultValue={planFilter}
                  className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500">
            <option value="">Все планы</option>
            <option value="trial">Trial</option>
            <option value="starter">Starter</option>
            <option value="growth">Growth</option>
            <option value="pro">Pro</option>
          </select>
          <button type="submit" className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-1.5 rounded-lg font-medium">
            Найти
          </button>
        </form>
      </header>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
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
          <tbody className="divide-y divide-slate-100">
            {(sellers ?? []).map((s: any) => {
              const c = counts[s.id] || { products: 0, alerts: 0, snapshots: 0 };
              return (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-900 font-mono text-xs">{s.email}</td>
                  <td className="px-4 py-3 text-slate-700">{s.display_name ?? "—"}</td>
                  <td className="px-4 py-3"><PlanBadge plan={s.plan} /></td>
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                    {s.trial_ends_at ? new Date(s.trial_ends_at).toLocaleDateString("ru-RU") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700 font-medium">{c.products}</td>
                  <td className="px-4 py-3 text-right">
                    {c.alerts > 0 ? <span className="text-amber-700 font-medium">{c.alerts}</span> : <span className="text-slate-400">0</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                    {new Date(s.created_at).toLocaleString("ru-RU")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/sellers/${s.id}` as any} className="text-violet-600 hover:text-violet-700 text-xs font-medium">
                      Открыть →
                    </Link>
                  </td>
                </tr>
              );
            })}
            {!sellers?.length && (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">Никого не найдено</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Страница {page} из {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <a href={`?page=${page - 1}${planFilter ? `&plan=${planFilter}` : ""}${search ? `&q=${search}` : ""}`}
                 className="px-3 py-1.5 border border-slate-200 rounded-lg hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 transition">← Назад</a>
            )}
            {page < totalPages && (
              <a href={`?page=${page + 1}${planFilter ? `&plan=${planFilter}` : ""}${search ? `&q=${search}` : ""}`}
                 className="px-3 py-1.5 border border-slate-200 rounded-lg hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 transition">Вперёд →</a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children, align }: { children?: React.ReactNode; align?: "right" }) {
  return <th className={`px-4 py-2.5 font-medium text-slate-600 text-xs uppercase tracking-wider ${align === "right" ? "text-right" : "text-left"}`}>{children}</th>;
}

function PlanBadge({ plan }: { plan: string }) {
  const styles: Record<string, string> = {
    trial: "bg-slate-100 text-slate-700",
    starter: "bg-sky-100 text-sky-700",
    growth: "bg-blue-100 text-blue-700",
    pro: "bg-violet-100 text-violet-700",
  };
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${styles[plan] ?? styles.trial}`}>{plan}</span>;
}
