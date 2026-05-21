import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UpgradeButton, ManageSubscriptionButton } from "./UpgradeButton";
import { Icons } from "../_components/Icons";

export const dynamic = "force-dynamic";

// Тарифы Александра (май 2026): multi-warehouse архитектура.
// Trial=15 складов (как Pro для конверсии), Старт=2, Рост=6, Про=15.
// Цены: 0 / 2500 / 6900 / 14900 ₽/мес.
const PLANS = [
  { id: "trial",   name: "Триал",  price: 0,     period: "30 дней бесплатно",
    features: ["15 складов", "Весь функционал бесплатно"] },
  { id: "starter", name: "Старт",  price: 2500,  period: "₽/мес",
    features: ["2 склада"] },
  { id: "growth",  name: "Рост",   price: 6900,  period: "₽/мес",
    features: ["6 складов"] },
  { id: "pro",     name: "Про",    price: 14900, period: "₽/мес",
    features: ["15 складов"] },
];

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ paid?: string; canceled?: string }> }) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: seller }, { count: warehouseCount }] = await Promise.all([
    supabase
      .from("sellers")
      .select("plan,trial_ends_at,plan_warehouses_limit,subscription_expires_at")
      .eq("id", user.id)
      .single(),
    supabase.from("data_connections").select("id", { count: "exact", head: true }).eq("seller_id", user.id),
  ]);

  const currentPlan = seller?.plan ?? "trial";
  const limit = seller?.plan_warehouses_limit ?? 15;
  const used = warehouseCount ?? 0;
  const currentName = PLANS.find(p => p.id === currentPlan)?.name ?? currentPlan;

  // Скоро ли истекает подписка (< 7 дней)?
  const expiresAt = seller?.subscription_expires_at ? new Date(seller.subscription_expires_at) : null;
  const now = new Date();
  const daysUntilExpire = expiresAt ? Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
  const expiringSoon = currentPlan !== "trial" && daysUntilExpire !== null && daysUntilExpire <= 7 && daysUntilExpire >= 0;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Баннер после возврата с Robokassa — успех */}
      {params.paid === "1" && (
        <div className="rounded-xl border border-lime-deep/40 bg-lime-soft p-4 flex items-start gap-3">
          <span className="text-lime-deep mt-0.5 text-lg shrink-0">✅</span>
          <div className="flex-1 text-sm">
            <div className="font-medium text-ink">Оплата прошла успешно</div>
            <p className="mt-1 text-ink-muted">
              Подписка активна на 30 дней. Обновление плана происходит в фоне — если вы видите старый план, обновите страницу через минуту.
            </p>
          </div>
        </div>
      )}

      {/* Баннер после отмены оплаты */}
      {params.canceled === "1" && (
        <div className="rounded-xl border border-line bg-bg-soft p-4 flex items-start gap-3">
          <span className="text-ink-muted mt-0.5 text-lg shrink-0">ℹ️</span>
          <div className="flex-1 text-sm text-ink-muted">
            Оплата отменена. Можете попробовать ещё раз — с вас ничего не списали.
          </div>
        </div>
      )}

      {/* Предупреждение о скором истечении подписки */}
      {expiringSoon && (
        <div className="rounded-xl border border-orange/40 bg-orange/5 p-4 flex items-start gap-3">
          <span className="text-orange mt-0.5 text-lg shrink-0">⏰</span>
          <div className="flex-1 text-sm">
            <div className="font-medium text-ink">
              Подписка истекает через {daysUntilExpire} {daysUntilExpire === 1 ? "день" : daysUntilExpire && daysUntilExpire < 5 ? "дня" : "дней"}
            </div>
            <p className="mt-1 text-ink-muted">
              {expiresAt!.toLocaleDateString("ru-RU")} — подписка закончится, и вы будете автоматически переведены на триал.
              Продлите подписку, нажав «Перейти на» в любом платном тарифе ниже.
            </p>
          </div>
        </div>
      )}

      <header>
        <div className="inline-flex items-center gap-2 mb-2">
          <span className="size-1 rounded-full bg-lime-deep" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">Тарифы</span>
        </div>
        <h1 className="font-display text-3xl md:text-4xl tracking-tight font-medium text-ink">Тарифы и оплата</h1>
        <p className="mt-2 text-ink-muted text-sm">
          Текущий план: <span className="font-medium text-lime-deep">{currentName}</span> · подключено <span className="font-medium text-ink tabular">{used}/{limit}</span> складов
        </p>
        {currentPlan === "trial" && seller?.trial_ends_at && (
          <p className="text-xs text-ink-hush mt-1 font-mono">
            Триал действует до {new Date(seller.trial_ends_at).toLocaleDateString("ru-RU")}
          </p>
        )}
        {currentPlan !== "trial" && expiresAt && (
          <p className="text-xs text-ink-hush mt-1 font-mono">
            Подписка действует до {expiresAt.toLocaleDateString("ru-RU")}
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
              <div className="mt-3 flex items-baseline gap-1 flex-wrap">
                <span className="font-display text-3xl md:text-4xl tracking-tight font-medium tabular text-ink">
                  {p.price.toLocaleString("ru-RU")}
                </span>
                <span className="text-sm text-ink-muted">{p.period}</span>
              </div>

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
                <UpgradeButton plan={p.id} isCurrent={isCurrent} label={isCurrent ? "Продлить на 30 дней" : `Перейти на ${p.name}`} />
              )}
            </div>
          );
        })}
      </div>

      <p className="text-center font-mono text-xs text-ink-hush flex items-center justify-center flex-wrap gap-x-2 gap-y-1 px-4">
        <span>Все тарифы включают весь функционал:</span>
        <span>TVelo</span><span>·</span>
        <span>Покрытие</span><span>·</span>
        <span>Потерянная выручка</span><span>·</span>
        <span>Планирование закупки</span><span>·</span>
        <span>Email + Telegram</span>
      </p>

      <div className="text-center font-mono text-[11px] text-ink-hush">
        Для интеграторов и агентств: <a href="mailto:info@proaim.ru" className="text-lime-deep hover:underline">info@proaim.ru</a>
      </div>

      <div className="text-center space-y-2">
        {currentPlan !== "trial" && <ManageSubscriptionButton />}
        <p className="font-mono text-[11px] text-ink-hush">Подписка продлевается выбором тарифа заново.</p>
      </div>
    </div>
  );
}
