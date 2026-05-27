import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UpgradeButton, ManageSubscriptionButton } from "./UpgradeButton";
import { RadarTrialButton } from "./RadarTrialButton";
import { Icons } from "../_components/Icons";

export const dynamic = "force-dynamic";

// Тарифы Veloseller и Radar — две оси биллинга.
const VELOSELLER_PLANS = [
  { id: "trial",   name: "Триал",  price: 0,     period: "30 дней бесплатно",
    features: ["15 складов", "Весь функционал бесплатно"] },
  { id: "starter", name: "Старт",  price: 2500,  period: "₽/мес",
    features: ["2 склада"] },
  { id: "growth",  name: "Рост",   price: 6900,  period: "₽/мес",
    features: ["6 складов"] },
  { id: "pro",     name: "Про",    price: 14900, period: "₽/мес",
    features: ["15 складов"] },
];

const RADAR_PLANS = [
  { id: "radar_start",  name: "Radar Старт",   price: 900,   features: ["3 бренда", "Wordstat + WB/OZON suggest", "Email дайджест"] },
  { id: "radar_seller", name: "Radar Селлер",  price: 2500,  features: ["10 брендов", "Всё из Старт", "ИИ-парсинг прайса"] },
  { id: "radar_pro",    name: "Radar Про",     price: 5000,  features: ["30 брендов", "Всё из Селлер", "Telegram-бот"] },
  { id: "radar_expert", name: "Radar Эксперт", price: 10000, features: ["100 брендов", "Всё из Про", "Приоритетная поддержка"] },
];

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ paid?: string; canceled?: string }> }) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: seller }, { count: warehouseCount }] = await Promise.all([
    supabase
      .from("sellers")
      .select("plan, trial_ends_at, plan_warehouses_limit, subscription_expires_at, radar_plan, radar_brands_limit, radar_active_until, radar_trial_started_at")
      .eq("id", user.id)
      .single(),
    supabase.from("data_connections").select("id", { count: "exact", head: true }).eq("seller_id", user.id),
  ]);

  const currentPlan = seller?.plan ?? "trial";
  const limit = seller?.plan_warehouses_limit ?? 15;
  const used = warehouseCount ?? 0;
  const currentName = VELOSELLER_PLANS.find(p => p.id === currentPlan)?.name ?? currentPlan;

  // Veloseller истечение
  const expiresAt = seller?.subscription_expires_at ? new Date(seller.subscription_expires_at) : null;
  const now = new Date();
  const daysUntilExpire = expiresAt ? Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
  const expiringSoon = currentPlan !== "trial" && daysUntilExpire !== null && daysUntilExpire <= 7 && daysUntilExpire >= 0;

  // Radar статус
  const radarPlan = seller?.radar_plan ?? "none";
  const radarActiveUntil = seller?.radar_active_until ? new Date(seller.radar_active_until) : null;
  const radarActive = radarPlan !== "none" && (!radarActiveUntil || radarActiveUntil > now);
  const radarTrialEverActivated = !!seller?.radar_trial_started_at;
  const radarDaysUntilExpire = radarActiveUntil ? Math.ceil((radarActiveUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
  // Преобразование: radar_plan в sellers хранится без префикса (start/seller/pro/expert/trial),
  // но в RADAR_PLANS.id — с префиксом radar_*. Сравнение через endsWith без префикса.
  const radarPlanShort = radarPlan;

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      {params.paid === "1" && (
        <div className="rounded-xl border border-lime-deep/40 bg-lime-soft p-4 flex items-start gap-3">
          <span className="text-lime-deep mt-0.5 text-lg shrink-0">✅</span>
          <div className="flex-1 text-sm">
            <div className="font-medium text-ink">Оплата прошла успешно</div>
            <p className="mt-1 text-ink-muted">
              Подписка активна на 30 дней. Обновление плана происходит в фоне — если видите старый план, обновите страницу через минуту.
            </p>
          </div>
        </div>
      )}
      {params.canceled === "1" && (
        <div className="rounded-xl border border-line bg-bg-soft p-4 flex items-start gap-3">
          <span className="text-ink-muted mt-0.5 text-lg shrink-0">ℹ️</span>
          <div className="flex-1 text-sm text-ink-muted">Оплата отменена. С вас ничего не списали.</div>
        </div>
      )}
      {expiringSoon && (
        <div className="rounded-xl border border-orange/40 bg-orange/5 p-4 flex items-start gap-3">
          <span className="text-orange mt-0.5 text-lg shrink-0">⏰</span>
          <div className="flex-1 text-sm">
            <div className="font-medium text-ink">
              Подписка истекает через {daysUntilExpire} {daysUntilExpire === 1 ? "день" : daysUntilExpire && daysUntilExpire < 5 ? "дня" : "дней"}
            </div>
            <p className="mt-1 text-ink-muted">
              {expiresAt!.toLocaleDateString("ru-RU")} — подписка закончится, и вы будете автоматически переведены на триал.
            </p>
          </div>
        </div>
      )}

      {/* ===== Секция 1: Veloseller — основной тариф ===== */}
      <section>
        <header>
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="size-1 rounded-full bg-lime-deep" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">Основной тариф</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl tracking-tight font-medium text-ink">Veloseller</h1>
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

        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          {VELOSELLER_PLANS.map(p => {
            const isCurrent = p.id === currentPlan;
            return (
              <div key={p.id} className={`rounded-2xl border p-6 transition ${
                isCurrent ? "border-2 border-lime-deep bg-lime-soft" : "border-line bg-paper hover:shadow-sm hover:border-lime-deep/30"
              }`}>
                <div className="flex items-baseline justify-between">
                  <h3 className="font-display text-lg font-medium text-ink">{p.name}</h3>
                  {isCurrent && <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 bg-ink text-paper rounded font-semibold">Активный</span>}
                </div>
                <div className="mt-3 flex items-baseline gap-1 flex-wrap">
                  <span className="font-display text-3xl md:text-4xl tracking-tight font-medium tabular text-ink">{p.price.toLocaleString("ru-RU")}</span>
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
                  <button disabled className="mt-6 w-full py-2.5 rounded-lg text-sm font-medium bg-bg-soft text-ink-hush border border-line">
                    {isCurrent ? "Активный" : "—"}
                  </button>
                ) : (
                  <UpgradeButton plan={p.id} isCurrent={isCurrent} label={isCurrent ? "Продлить на 30 дней" : `Перейти на ${p.name}`} />
                )}
              </div>
            );
          })}
        </div>

        <p className="text-center font-mono text-xs text-ink-hush flex items-center justify-center flex-wrap gap-x-2 gap-y-1 px-4 mt-6">
          <span>Все тарифы включают весь функционал:</span>
          <span>TVelo</span><span>·</span>
          <span>Покрытие</span><span>·</span>
          <span>Потерянная выручка</span><span>·</span>
          <span>Планирование закупки</span><span>·</span>
          <span>Email + Telegram</span>
        </p>
      </section>

      {/* ===== Секция 2: Radar — отдельный модуль ===== */}
      <section>
        <header>
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="size-1 rounded-full bg-azure" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-azure font-semibold">Модуль Radar</span>
          </div>
          <h2 className="font-display text-2xl md:text-3xl tracking-tight font-medium text-ink">
            Veloseller Radar
          </h2>
          <p className="mt-2 text-ink-muted text-sm max-w-2xl">
            Отдельный модуль для мониторинга появления новинок в ассортименте ваших брендов.
            Wordstat ловит рост запроса, WB/OZON suggest подтверждает спрос на покупку —
            вы узнаёте о новинке раньше конкурентов.
          </p>
          <p className="mt-3 text-sm">
            {radarActive ? (
              <>
                <span className="text-ink-muted">Текущий Radar-тариф: </span>
                <span className="font-medium text-azure">{radarPlanShort === "trial" ? "Trial" : RADAR_PLANS.find(p => p.id.endsWith(radarPlanShort))?.name ?? radarPlan}</span>
                {radarActiveUntil && (
                  <span className="text-ink-hush ml-2 font-mono text-xs">
                    · до {radarActiveUntil.toLocaleDateString("ru-RU")}
                    {radarDaysUntilExpire !== null && radarDaysUntilExpire < 7 && radarDaysUntilExpire >= 0 && (
                      <span className="text-orange ml-1">({radarDaysUntilExpire} д.)</span>
                    )}
                  </span>
                )}
              </>
            ) : (
              <span className="text-ink-hush">Radar не подключен</span>
            )}
          </p>
        </header>

        {/* Trial кнопка — только если ещё не пробовали и не подписаны */}
        {!radarTrialEverActivated && !radarActive && (
          <div className="mt-6 rounded-2xl border-2 border-dashed border-azure/40 bg-azure/5 p-6 md:p-8 text-center">
            <h3 className="font-display text-xl font-medium text-ink">Попробуйте бесплатно</h3>
            <p className="mt-2 text-sm text-ink-muted max-w-xl mx-auto">
              14 дней, до 3 брендов, без привязки карты. После trial — любой платный тариф или отключение.
            </p>
            <div className="mt-4">
              <RadarTrialButton />
            </div>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          {RADAR_PLANS.map(p => {
            // Сравнение без префикса: radar_start → sellers.radar_plan = 'start'
            const planShort = p.id.replace(/^radar_/, "");
            const isCurrent = radarActive && radarPlanShort === planShort;
            return (
              <div key={p.id} className={`rounded-2xl border p-6 transition ${
                isCurrent ? "border-2 border-azure bg-azure/5" : "border-line bg-paper hover:shadow-sm hover:border-azure/30"
              }`}>
                <div className="flex items-baseline justify-between">
                  <h3 className="font-display text-base font-medium text-ink">{p.name}</h3>
                  {isCurrent && <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 bg-ink text-paper rounded font-semibold">Активный</span>}
                </div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="font-display text-2xl md:text-3xl tracking-tight font-medium tabular text-ink">{p.price.toLocaleString("ru-RU")}</span>
                  <span className="text-sm text-ink-muted">₽/мес</span>
                </div>
                <ul className="mt-4 space-y-1.5 text-sm text-ink-soft">
                  {p.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-azure mt-0.5 shrink-0"><Icons.Check size={11} /></span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <UpgradeButton plan={p.id} isCurrent={isCurrent} label={isCurrent ? "Продлить" : `Перейти на ${p.name}`} />
              </div>
            );
          })}
        </div>
      </section>

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
