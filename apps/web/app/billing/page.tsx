import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UpgradeButton, ManageSubscriptionButton } from "./UpgradeButton";
import { Icons } from "../_components/Icons";

export const dynamic = "force-dynamic";

const PLANS = [
  { id: "trial",   name: "Trial",   price: "0",   limit: 50,    period: "30 дней бесплатно",
    features: ["Все источники данных", "Полный TVelo", "Health score", "Email + Telegram уведомления"] },
  { id: "starter", name: "Starter", price: "24",  limit: 500,   period: "$/мес",
    features: ["Всё из Trial", "До 500 SKU", "Помесячная динамика", "Sparkline-тренды"] },
  { id: "growth",  name: "Growth",  price: "89",  limit: 4000,  period: "$/мес",
    features: ["Всё из Starter", "До 4000 SKU", "Price elasticity", "Underestimated SKU"] },
  { id: "pro",     name: "Pro",     price: "299", limit: 10000, period: "$/мес",
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
  const currentName = PLANS.find(p => p.id === currentPlan)?.name ?? currentPlan;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <header>
        <div className="inline-flex items-center gap-2 mb-2">
          <span className="size-1 rounded-full bg-lime-deep" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">Billing</span>
        </div>
        <h1 className="font-display text-3xl md:text-4xl tracking-tight font-medium text-ink">Тарифы</h1>
        <p className="mt-2 text-ink-muted text-sm">
          Текущий план: <span className="font-medium text-lime-deep">{currentName}</span> · использовано <span className="font-medium text-ink tabular">{used}</span> SKU
        </p>
        {currentPlan === "trial" && seller?.trial_ends_at && (
          <p className="text-xs text-ink-hush mt-1 font-mono">
            Trial действует до {new Date(seller.trial_ends_at).toLocaleDateString("ru-RU")}
          </p>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {PLANS.map(p => {
          const isCurrent = p.id === currentPlan;
          return (
            <div
              key={p.id}
              className={`rounded-2xl border p-6 transition ${
                isCurrent
                  ? "border-2 border-lime-deep bg-lime-soft"
                  : "border-line bg-paper hover:shadow-sm hover:border-lime-deep/30"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-lg font-medium text-ink">{p.name}</h3>
                {isCurrent && (
                  <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 bg-ink text-paper rounded font-semibold">
                    Активный
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="font-display text-3xl md:text-4xl tracking-tight font-medium tabular text-ink">${p.price}</span>
                <span className="text-sm text-ink-muted">{p.period}</span>
              </div>
              <div className="mt-1 font-mono text-xs text-ink-hush">до <span className="text-ink-soft font-semibold">{p.limit.toLocaleString("ru-RU")}</span> SKU</div>

              <ul className="mt-5 space-y-2 text-sm text-ink-soft">
                {p.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-lime-deep mt-0.5 shrink-0"><Icons.Check size={12} /></span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {p.id === "trial" ? (
                <button
                  disabled
                  className="mt-6 w-full py-2.5 rounded-lg text-sm font-medium bg-bg-soft text-ink-hush border border-line"
                >
                  {isCurrent ? "Активный" : "—"}
                </button>
              ) : (
                <UpgradeButton plan={p.id} isCurrent={isCurrent} label={isCurrent ? "Активный" : `Перейти на ${p.name}`} />
              )}
            </div>
          );
        })}
      </div>

      <div className="text-center space-y-2">
        {currentPlan !== "trial" && <ManageSubscriptionButton />}
        <p className="font-mono text-[11px] text-ink-hush">Платежи через Stripe. Подписку можно отменить в любой момент.</p>
      </div>
    </div>
  );
}
