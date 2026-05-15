import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { UpgradeButton, ManageSubscriptionButton } from "./UpgradeButton";

export const dynamic = "force-dynamic";

const PLANS = [
  { id: "trial",    name: "Trial",    price: "0",   limit: 50,    period: "30 дней бесплатно",
    features: ["Все источники данных", "Полный TVelo", "Health score", "Email + Telegram уведомления"] },
  { id: "starter",  name: "Starter",  price: "24",  limit: 500,   period: "$/мес",
    features: ["Всё из Trial", "До 500 SKU", "Помесячная динамика", "Sparkline-тренды"] },
  { id: "growth",   name: "Growth",   price: "89",  limit: 4000,  period: "$/мес",
    features: ["Всё из Starter", "До 4000 SKU", "Price elasticity", "Underestimated SKU"] },
  { id: "pro",      name: "Pro",      price: "299", limit: 10000, period: "$/мес",
    features: ["Всё из Growth", "До 10000 SKU", "Приоритетная поддержка", "API доступ"] },
];

export default async function BillingPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: seller }, { count: skuCount }] = await Promise.all([
    supabase.from("sellers").select("plan,trial_ends_at").eq("id", user.id).single(),
    supabase.from("products").select("product_id", { count: "exact", head: true }).eq("seller_id", user.id),
  ]);

  const currentPlan = seller?.plan ?? "trial";
  const used = skuCount ?? 0;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">Тарифы</h1>
        <p className="text-slate-600 mt-2">Текущий план: <span className="font-semibold text-violet-700">{PLANS.find(p => p.id === currentPlan)?.name ?? currentPlan}</span> · использовано <span className="font-semibold">{used}</span> SKU</p>
        {currentPlan === "trial" && seller?.trial_ends_at && (
          <p className="text-sm text-slate-500 mt-1">
            Trial действует до {new Date(seller.trial_ends_at).toLocaleDateString("ru-RU")}
          </p>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {PLANS.map(p => {
          const isCurrent = p.id === currentPlan;
          const limitReached = used >= p.limit;
          return (
            <div key={p.id} className={`rounded-2xl border p-6 ${isCurrent ? "border-violet-300 bg-violet-50" : "border-slate-200 bg-white"}`}>
              <div className="flex items-baseline justify-between">
                <h3 className="text-lg font-semibold text-slate-900">{p.name}</h3>
                {isCurrent && <span className="text-xs px-2 py-0.5 bg-violet-600 text-white rounded">Активный</span>}
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-slate-900">${p.price}</span>
                <span className="text-sm text-slate-500">{p.period}</span>
              </div>
              <div className="mt-2 text-sm text-slate-600">до <span className="font-semibold">{p.limit.toLocaleString("ru-RU")}</span> SKU</div>

              <ul className="mt-5 space-y-2 text-sm text-slate-700">
                {p.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-violet-600 mt-0.5">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {p.id === "trial" ? (
                <button disabled className="mt-6 w-full py-2.5 rounded-lg text-sm font-medium bg-slate-200 text-slate-500">{isCurrent ? "Активный" : "—"}</button>
              ) : (
                <UpgradeButton plan={p.id} isCurrent={isCurrent} label={isCurrent ? "Активный" : `Перейти на ${p.name}`} />
              )}
            </div>
          );
        })}
      </div>

      <div className="text-center space-y-2">
        {currentPlan !== "trial" && <ManageSubscriptionButton />}
        <p className="text-xs text-slate-400">Платежи через Stripe. Подписку можно отменить в любой момент.</p>
      </div>
    </div>
  );
}
