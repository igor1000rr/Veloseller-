import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import RadarTabs from "./RadarTabs";
import RadarTable from "./RadarTable";
import { OnboardingBlock } from "./OnboardingBlock";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Radar v2 (29.05.2026, план Александра): только 3 вкладки.
// new      — Wordstat фраза brand+model которой нет в прайсе селлера.
//             Это кандидат на новинку для закупки.
// watching — пользователь добавил в избранное.
// archived — model уже в прайсе селлера (продаёт), или ручной архив,
//             или автоархив после 30 дней без обновлений.
// Статус 'early' убран — раньше был для случаев когда Wordstat есть,
// suggest пусто; теперь suggest WB/Ozon не используется.
export type RadarTab = "new" | "watching" | "archived";

const TAB_TITLES: Record<RadarTab, string> = {
  new:      "Новые",
  watching: "Наблюдение",
  archived: "Архив",
};

// Тарифы Radar (rub/мес, лимит брендов).
// Должны совпадать с PLAN_RADAR_LIMITS в lib/radar-plans.ts (если есть)
// и с тарифами в Robokassa.
const RADAR_TIERS: Array<{ id: string; name: string; limit: number; price: number }> = [
  { id: "trial",  name: "Trial",   limit: 3,   price: 0 },
  { id: "start",  name: "Старт",   limit: 3,   price: 900 },
  { id: "seller", name: "Селлер",  limit: 10,  price: 2500 },
  { id: "pro",    name: "Про",     limit: 30,  price: 5000 },
  { id: "expert", name: "Эксперт", limit: 100, price: 10000 },
];

function getNextTier(currentLimit: number, untrackedCount: number) {
  // Ищем минимальный tier который покрывает (current + untracked).
  const needed = currentLimit + untrackedCount;
  return RADAR_TIERS.find(t => t.limit >= needed)
      ?? RADAR_TIERS[RADAR_TIERS.length - 1];  // если нужно > 100, всё равно ведём на expert
}

export default async function RadarPage({ searchParams }: {
  searchParams: Promise<{ tab?: string; brand?: string; welcome?: string }>;
}) {
  const sp = await searchParams;
  // Дефолтный таб — 'new' (раньше был 'early'). Это самые ценные сигналы.
  const tab: RadarTab = (["new", "watching", "archived"].includes(sp.tab ?? "") ? sp.tab : "new") as RadarTab;
  const brandFilter = sp.brand || null;
  const isWelcome = sp.welcome === "1";

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Проверяем доступ к Radar — radar_plan != 'none' OR active trial.
  const { data: seller } = await supabase
    .from("sellers")
    .select("radar_plan, radar_brands_limit, radar_active_until, radar_trial_started_at")
    .eq("id", user.id)
    .maybeSingle();

  const hasAccess = seller && seller.radar_plan && seller.radar_plan !== "none"
    && (!seller.radar_active_until || new Date(seller.radar_active_until) > new Date());

  // Считаем количество брендов и запросов в каждом статусе для бейджей вкладок.
  const [brandsRes, countsRes] = await Promise.all([
    supabase
      .from("radar_brands")
      .select("id, name, status, sku_count, source")
      .eq("seller_id", user.id)
      .order("status", { ascending: true })  // approved сначала
      .order("sku_count", { ascending: false, nullsFirst: false })
      .order("name"),
    supabase
      .from("radar_queries")
      .select("status", { count: "exact" })
      .eq("seller_id", user.id),
  ]);
  const brands = brandsRes.data ?? [];
  const approvedBrands = brands.filter(b => b.status === "approved");
  const excludedBrands = brands.filter(b => b.status === "excluded");

  // Группируем counts по status — только 3 вкладки v2.
  // Старые записи со status='early' (если есть от v1) считаем как 'new'.
  const tabCounts: Record<RadarTab, number> = { new: 0, watching: 0, archived: 0 };
  for (const row of (countsRes.data ?? []) as any[]) {
    const status = row.status === "early" ? "new" : row.status;
    if (status in tabCounts) tabCounts[status as RadarTab]++;
  }

  // Selected tab → запрос рядов через view radar_queries_view (с brand_name + derived).
  // Для tab='new' включаем также legacy 'early' записи (backward compat).
  let queries: any[] = [];
  if (hasAccess && approvedBrands.length > 0) {
    const statuses = tab === "new" ? ["new", "early"] : [tab];
    let query = supabase
      .from("radar_queries_view")
      .select("*")
      .eq("seller_id", user.id)
      .in("status", statuses)
      .order("current_frequency", { ascending: false, nullsFirst: false })
      .limit(500);
    if (brandFilter) query = query.eq("brand_id", brandFilter);
    const { data } = await query;
    queries = data ?? [];
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-medium tracking-tight text-ink">
            Radar
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted max-w-2xl">
            Сопоставляем спрос из Wordstat с вашим прайсом. Показываем
            <span className="text-ink"> новинки</span>, которых у вас ещё нет — кандидаты для закупки.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={"/dashboard/radar/brands" as any}
            className="inline-flex items-center rounded-lg border border-line bg-paper text-ink-muted hover:text-ink hover:border-lime-deep/40 px-3 py-2 text-sm font-mono uppercase tracking-wider transition"
          >
            Бренды ({approvedBrands.length})
          </Link>
          <Link
            href={"/dashboard/radar/upload" as any}
            className="inline-flex items-center rounded-lg bg-lime-deep text-paper hover:bg-lime-deep/90 px-4 py-2 text-sm font-mono uppercase tracking-wider font-semibold transition"
          >
            Загрузить прайс
          </Link>
        </div>
      </div>

      {/* Welcome-баннер после активации триала (?welcome=1).
          Закрытие — через ссылку на /dashboard/radar без параметра. */}
      {isWelcome && hasAccess && approvedBrands.length === 0 && (
        <WelcomeBanner plan={seller?.radar_plan ?? ""} />
      )}

      {!hasAccess ? (
        <RadarNoAccess plan={seller?.radar_plan ?? "none"} />
      ) : approvedBrands.length === 0 ? (
        <OnboardingBlock
          plan={seller?.radar_plan ?? ""}
          brandsLimit={seller?.radar_brands_limit ?? 0}
        />
      ) : (
        <>
          <RadarTabs tab={tab} counts={tabCounts} brandFilter={brandFilter} />
          <RadarTable
            queries={queries}
            tab={tab}
            brands={approvedBrands}
            brandFilter={brandFilter}
            currentTabTitle={TAB_TITLES[tab]}
          />

          {/* Teaser-секция: бренды которые селлер загрузил, но НЕ подключил к
              отслеживанию (excluded). Фишка Александра 29.05.2026 — даёт FOMO
              «а не пропускаю ли я что-то по этим брендам». Драйвер апгрейда тарифа. */}
          {excludedBrands.length > 0 && (
            <UntrackedBrandsTeaser
              excluded={excludedBrands}
              currentPlan={seller?.radar_plan ?? ""}
              currentLimit={seller?.radar_brands_limit ?? 0}
            />
          )}
        </>
      )}
    </div>
  );
}

function UntrackedBrandsTeaser({
  excluded,
  currentPlan,
  currentLimit,
}: {
  excluded: Array<{ id: string; name: string; sku_count: number | null; source: string }>;
  currentPlan: string;
  currentLimit: number;
}) {
  const nextTier = getNextTier(currentLimit, excluded.length);
  const isMaxTier = nextTier.id === "expert" && currentPlan === "expert";

  // Показ ограничен до 30 брендов чтобы не было визуального переполнения.
  const DISPLAY_LIMIT = 30;
  const visible = excluded.slice(0, DISPLAY_LIMIT);
  const hiddenCount = excluded.length - visible.length;

  return (
    <section className="rounded-2xl border-2 border-orange/30 bg-gradient-to-br from-orange/[0.05] to-rose/[0.03] overflow-hidden">
      <div className="px-5 py-4 border-b border-orange/20 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="shrink-0 size-10 rounded-full bg-orange/15 flex items-center justify-center mt-0.5">
            <span className="text-xl">👀</span>
          </div>
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-widest text-orange font-semibold mb-1">
              Не отслеживаются
            </div>
            <h3 className="font-display text-lg md:text-xl font-medium text-ink">
              {excluded.length}{" "}
              {pluralizeBrand(excluded.length)} вне Radar
            </h3>
            <p className="mt-1.5 text-sm text-ink-muted max-w-xl leading-relaxed">
              Эти бренды у вас в системе, но Radar по ним не собирает сигналы — лимит тарифа{" "}
              {currentLimit > 0 && (
                <span className="font-mono text-ink-soft">
                  ({currentLimit} {pluralizeBrand(currentLimit)})
                </span>
              )}.
              {!isMaxTier && " Вы можете пропускать новинки в этих категориях."}
            </p>
          </div>
        </div>
        {!isMaxTier ? (
          <Link
            href={"/billing" as any}
            className="shrink-0 inline-flex items-center rounded-lg bg-orange text-paper hover:bg-orange/90 px-4 py-2.5 text-sm font-mono uppercase tracking-wider font-semibold transition whitespace-nowrap"
          >
            Тариф {nextTier.name} — {nextTier.limit}{" "}
            {pluralizeBrand(nextTier.limit)} за {nextTier.price.toLocaleString("ru-RU")}₽
          </Link>
        ) : (
          <div className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-ink-hush">
            Максимальный тариф
          </div>
        )}
      </div>

      <div className="p-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {visible.map(b => (
          <Link
            key={b.id}
            href={`/dashboard/radar/brands/${b.id}` as any}
            className="group relative rounded-lg border border-line bg-paper/70 px-3 py-2.5 hover:bg-paper hover:border-orange/40 transition"
            title="Бренд не отслеживается. Подключите тариф чтобы видеть сигналы."
          >
            <div className="font-medium text-ink-muted group-hover:text-ink text-sm truncate transition">
              {b.name}
            </div>
            <div className="flex items-center justify-between mt-0.5 gap-2">
              {b.sku_count != null && b.sku_count > 0 ? (
                <span className="font-mono text-[10px] text-ink-hush">{b.sku_count} SKU</span>
              ) : (
                <span />
              )}
              <span className="font-mono text-[9px] uppercase tracking-wider text-orange/70 group-hover:text-orange transition">
                закрыто
              </span>
            </div>
          </Link>
        ))}
        {hiddenCount > 0 && (
          <div className="rounded-lg border border-dashed border-line bg-bg-soft/50 px-3 py-2.5 flex items-center justify-center text-center">
            <span className="font-mono text-xs text-ink-hush">
              и ещё {hiddenCount}
            </span>
          </div>
        )}
      </div>

      {!isMaxTier && (
        <div className="px-5 py-3 border-t border-orange/15 bg-paper/40 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-ink-muted">
            На тарифе <span className="font-medium text-ink">{nextTier.name}</span> отслеживаются все ваши{" "}
            <span className="font-medium text-ink">{currentLimit + excluded.length} {pluralizeBrand(currentLimit + excluded.length)}</span>
            {" "}— ни одной новинки не пропустите.
          </div>
          <Link
            href={"/dashboard/radar/brands" as any}
            className="font-mono text-[10px] uppercase tracking-wider text-ink-hush hover:text-ink transition"
          >
            Управление списком →
          </Link>
        </div>
      )}
    </section>
  );
}

function pluralizeBrand(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "бренд";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "бренда";
  return "брендов";
}

function WelcomeBanner({ plan }: { plan: string }) {
  return (
    <div className="rounded-2xl border-2 border-azure/40 bg-gradient-to-br from-azure/10 to-lime-soft/40 p-6">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 size-12 rounded-full bg-azure/20 flex items-center justify-center">
          <span className="text-2xl">🎯</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-widest text-azure font-semibold mb-1">
            Тариф {plan} активирован
          </div>
          <h3 className="font-display text-xl md:text-2xl font-medium text-ink">
            Добро пожаловать в Radar
          </h3>
          <p className="mt-2 text-sm text-ink leading-relaxed max-w-2xl">
            Дальше — загрузите прайс. Из него мы возьмём бренды и модели,
            а worker раз в три дня будет проверять Wordstat и показывать
            новинки которых у вас ещё нет. Первый дайджест — через неделю.
          </p>
          <Link
            href={"/dashboard/radar" as any}
            className="mt-3 inline-block font-mono text-[10px] uppercase tracking-wider text-ink-hush hover:text-ink transition"
          >
            Закрыть
          </Link>
        </div>
      </div>
    </div>
  );
}

function RadarNoAccess({ plan }: { plan: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-line bg-paper p-8 md:p-12 text-center">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-lime-deep/30 bg-lime-soft/40 mb-4">
        <span className="size-1.5 rounded-full bg-lime-deep" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-lime-deep font-semibold">new module</span>
      </div>
      <h2 className="font-display text-2xl md:text-3xl font-medium text-ink">Подключите Radar</h2>
      <p className="mx-auto mt-3 max-w-2xl text-ink-muted leading-relaxed">
        Radar отдельный модуль Veloseller для отслеживания новинок у брендов
        через Wordstat и сопоставление с вашим прайсом. Trial 14 дней — бесплатно.
      </p>
      <Link
        href={"/billing" as any}
        className="inline-flex items-center mt-6 rounded-lg bg-ink text-paper px-5 py-3 font-mono uppercase tracking-wider text-sm font-semibold hover:bg-ink-soft transition"
      >
        Активировать Trial
      </Link>
    </div>
  );
}
