import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { RadarTabs } from "./RadarTabs";
import { QueriesTable } from "./QueriesTable";
import { RadarFilters } from "./RadarFilters";
import { OnboardingBlock } from "./OnboardingBlock";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Tab = "early" | "new" | "watching" | "archived";

export default async function RadarPage({ searchParams }: {
  searchParams: Promise<{ tab?: string; brand?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const tab: Tab = (["early", "new", "watching", "archived"].includes(sp.tab ?? "") ? sp.tab : "new") as Tab;
  const brandFilter = sp.brand ?? "";
  const search = sp.q ?? "";

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Проверка тарифа Radar. Если none — показываем CTA.
  const { data: seller } = await supabase
    .from("sellers")
    .select("radar_plan,radar_brands_limit,radar_active_until,radar_trial_started_at")
    .eq("id", user.id)
    .maybeSingle();

  const radarPlan = (seller as any)?.radar_plan ?? "none";
  const brandsLimit = (seller as any)?.radar_brands_limit ?? 0;
  const activeUntil = (seller as any)?.radar_active_until as string | null;
  const trialStarted = (seller as any)?.radar_trial_started_at as string | null;

  if (radarPlan === "none") {
    return <RadarUnavailable hasUsedTrial={!!trialStarted} />;
  }

  // Подгружаем бренды (для фильтра и онбординга) и текущие запросы
  const [{ data: brands }, { count: queriesCount }] = await Promise.all([
    supabase
      .from("radar_brands")
      .select("id,name,status,sku_count")
      .eq("seller_id", user.id)
      .order("sku_count", { ascending: false }),
    supabase
      .from("radar_queries")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", user.id),
  ]);

  const approvedBrands = (brands ?? []).filter((b: any) => b.status === "approved");
  const brandsCount = approvedBrands.length;

  // Если брендов нет — показываем онбординг (загрузить прайс / добавить руками)
  if (brandsCount === 0) {
    return (
      <OnboardingBlock
        plan={radarPlan}
        brandsLimit={brandsLimit}
      />
    );
  }

  // Считаем количество в каждой вкладке для бейджей
  const tabCounts = await getTabCounts(supabase, user.id);

  // Запросы для текущей вкладки
  let queryBuilder = supabase
    .from("radar_queries")
    .select(`
      id, query_text, current_frequency, trend_pct,
      present_in_wb, present_in_ozon, is_favorite,
      status, first_seen_at, last_updated_at,
      brand_id, radar_brands(name)
    `)
    .eq("seller_id", user.id)
    .eq("status", tab)
    .order("current_frequency", { ascending: false })
    .limit(200);

  if (brandFilter) {
    queryBuilder = queryBuilder.eq("brand_id", brandFilter);
  }
  if (search) {
    queryBuilder = queryBuilder.ilike("query_text", `%${search}%`);
  }

  const { data: queries } = await queryBuilder;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-medium tracking-tight text-ink">
            Radar
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted leading-relaxed max-w-2xl">
            Мониторим появление новинок в ассортименте ваших брендов через Wordstat и подсказки маркетплейсов.
            Совпадение спроса в Wordstat + наличия в WB/OZON = реальный сигнал на закупку.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={"/dashboard/radar/brands" as any}
            className="inline-flex items-center rounded-lg border border-line bg-paper hover:border-lime-deep/40 px-3 py-2 text-sm font-medium text-ink transition"
          >
            Бренды ({brandsCount}/{brandsLimit})
          </Link>
          <Link
            href={"/dashboard/radar/upload" as any}
            className="inline-flex items-center rounded-lg bg-ink hover:bg-ink-soft text-paper px-3 py-2 text-sm font-medium transition"
          >
            Загрузить прайс
          </Link>
        </div>
      </div>

      {/* Активная подписка */}
      {activeUntil && (
        <div className="rounded-xl border border-lime-deep/30 bg-lime-soft/40 p-3 flex items-center justify-between gap-3 flex-wrap text-sm">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-widest text-lime-deep font-semibold">
              Тариф {radarPlan}
            </span>
            <span className="ml-2 text-ink-muted">
              активен до {new Date(activeUntil).toLocaleDateString("ru-RU")}
            </span>
          </div>
          <Link href={"/billing" as any} className="font-mono text-[11px] uppercase tracking-wider text-lime-deep hover:underline">
            Управлять →
          </Link>
        </div>
      )}

      <RadarTabs currentTab={tab} counts={tabCounts} />

      <RadarFilters
        currentBrand={brandFilter}
        currentSearch={search}
        brands={approvedBrands}
      />

      <QueriesTable queries={queries ?? []} tab={tab} />
    </div>
  );
}

async function getTabCounts(supabase: any, sellerId: string) {
  const tabs: Tab[] = ["early", "new", "watching", "archived"];
  const counts: Record<Tab, number> = { early: 0, new: 0, watching: 0, archived: 0 };

  // Параллельные запросы count по каждой вкладке
  await Promise.all(
    tabs.map(async (t) => {
      const { count } = await supabase
        .from("radar_queries")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", sellerId)
        .eq("status", t);
      counts[t] = count ?? 0;
    })
  );

  return counts;
}

function RadarUnavailable({ hasUsedTrial }: { hasUsedTrial: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-8 md:p-12 text-center max-w-3xl mx-auto">
      <div className="font-mono text-[10px] uppercase tracking-widest text-lime-deep font-semibold mb-3">
        Radar · Новый модуль
      </div>
      <h1 className="font-display text-2xl md:text-3xl font-medium text-ink">
        Мониторинг новинок в ассортименте ваших брендов
      </h1>
      <p className="mx-auto mt-4 max-w-2xl text-ink-muted leading-relaxed">
        Подключите Radar, чтобы получать сигналы о новых популярных запросах в Wordstat,
        подтверждённых наличием в WB и OZON. Это позволит первыми удовлетворять спрос
        и снимать сливки прибыли, пока конкуренты только начинают анализировать рынок.
      </p>

      <div className="mt-8 grid sm:grid-cols-3 gap-3 max-w-2xl mx-auto text-left">
        <div className="rounded-xl border border-line bg-bg-soft p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-1">Шаг 1</div>
          <div className="font-medium text-ink text-sm">Загружаете прайс</div>
          <div className="text-xs text-ink-muted mt-1">ИИ извлекает список брендов</div>
        </div>
        <div className="rounded-xl border border-line bg-bg-soft p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-1">Шаг 2</div>
          <div className="font-medium text-ink text-sm">Подтверждаете бренды</div>
          <div className="text-xs text-ink-muted mt-1">Лишние убираете в один клик</div>
        </div>
        <div className="rounded-xl border border-line bg-bg-soft p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-1">Шаг 3</div>
          <div className="font-medium text-ink text-sm">Получаете сигналы</div>
          <div className="text-xs text-ink-muted mt-1">Email + Telegram дайджест</div>
        </div>
      </div>

      <div className="mt-8 flex gap-3 justify-center flex-wrap">
        <Link
          href={"/billing#radar" as any}
          className="inline-flex items-center rounded-lg bg-ink text-paper px-5 py-3 font-semibold hover:bg-ink-soft transition"
        >
          Выбрать тариф
        </Link>
        {!hasUsedTrial && (
          <Link
            href={"/billing#radar-trial" as any}
            className="inline-flex items-center rounded-lg border border-line bg-paper text-ink px-5 py-3 font-semibold hover:border-lime-deep/40 transition"
          >
            Начать пробный период (14 дн)
          </Link>
        )}
      </div>
    </div>
  );
}
