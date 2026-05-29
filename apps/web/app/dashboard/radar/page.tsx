import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import RadarTabs from "./RadarTabs";
import RadarTable from "./RadarTable";
import { OnboardingBlock } from "./OnboardingBlock";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// 4 вкладки Radar — соответствуют status в radar_queries.
// early    — Wordstat нашёл частоту, но WB/OZON suggest пусто. "Ранние сигналы".
// new      — впервые появилось в любом suggest за последние 7 дней. "Новые".
// watching — пользователь добавил в избранное. "Наблюдение".
// archived — отклонено или закуплено. "Архив".
export type RadarTab = "early" | "new" | "watching" | "archived";

const TAB_TITLES: Record<RadarTab, string> = {
  early:    "Ранние сигналы",
  new:      "Новые",
  watching: "Наблюдение",
  archived: "Архив",
};

export default async function RadarPage({ searchParams }: {
  searchParams: Promise<{ tab?: string; brand?: string; welcome?: string }>;
}) {
  const sp = await searchParams;
  const tab: RadarTab = (["early", "new", "watching", "archived"].includes(sp.tab ?? "") ? sp.tab : "early") as RadarTab;
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
      .select("id, name, status, sku_count")
      .eq("seller_id", user.id)
      .order("name"),
    supabase
      .from("radar_queries")
      .select("status", { count: "exact" })
      .eq("seller_id", user.id),
  ]);
  const brands = brandsRes.data ?? [];
  const approvedBrands = brands.filter(b => b.status === "approved");

  // Группируем counts по status одним проходом.
  const tabCounts: Record<RadarTab, number> = { early: 0, new: 0, watching: 0, archived: 0 };
  for (const row of (countsRes.data ?? []) as any[]) {
    if (row.status in tabCounts) tabCounts[row.status as RadarTab]++;
  }

  // Selected tab → запрос рядов через view radar_queries_view (с brand_name + derived).
  let queries: any[] = [];
  if (hasAccess && approvedBrands.length > 0) {
    let query = supabase
      .from("radar_queries_view")
      .select("*")
      .eq("seller_id", user.id)
      .eq("status", tab)
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
            Wordstat + WB/OZON suggest. Ловит новинки в ассортименте брендов
            <span className="text-ink"> раньше</span> чем они начнут собирать отзывы.
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
        </>
      )}
    </div>
  );
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
            Дальше — загрузите прайс или добавьте бренды руками. Worker
            проснётся раз в 3 дня и начнёт собирать сигналы из Wordstat
            и подсказок маркетплейсов. Первый дайджест придёт через неделю.
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
        Radar отдельный модуль Veloseller для отслеживания появления новинок
        в ассортименте брендов через Wordstat + WB/OZON suggest. Trial 14 дней — бесплатно.
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
