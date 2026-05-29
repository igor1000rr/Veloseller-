import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { HealthTrend, LostRevenueTrend, SegmentPie } from "./StoreCharts";
import { DayProgress } from "./DayProgress";
import { PeriodSelector } from "./PeriodSelector";
import { DeadInventoryChart } from "./StoreCharts";
import { HealthScoreBlock } from "./HealthScale";
import { formatMoney } from "@/lib/format-money";
import { InfoTooltip } from "../_components/InfoTooltip";
import { getSelectedWarehouse, listWarehouses, warehouseKindLabel } from "@/lib/warehouse";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardOverview({ searchParams }: {
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;
  const period: "7" | "30" | "90" = (["7", "30", "90"].includes(sp.period ?? "") ? sp.period : "30") as any;
  const periodDays = parseInt(period, 10);

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [selected, allWarehouses] = await Promise.all([
    getSelectedWarehouse(supabase, user.id),
    listWarehouses(supabase, user.id),
  ]);

  if (allWarehouses.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-paper p-8 md:p-10 text-center">
        <h1 className="font-display text-2xl md:text-3xl font-medium text-ink">Подключите первый склад</h1>
        <p className="mx-auto mt-3 max-w-xl text-ink-muted leading-relaxed">
          Чтобы Veloseller начал считать вашу скорость продаж, нужны ежедневные записи по SKU.
          Первые расчёты — через 7 дней. Точные показатели — через месяц.
          Сводные отчёты приходят на email.
        </p>
        <div className="mt-6 flex gap-3 justify-center flex-wrap">
          <Link href={"/onboarding" as any} className="inline-flex items-center rounded-lg border border-line bg-bg-soft text-ink px-5 py-3 font-semibold hover:border-lime-deep/40 transition">Гид по настройке</Link>
          <Link href={"/connections/new" as any} className="inline-flex items-center rounded-lg bg-ink text-paper px-5 py-3 font-semibold hover:bg-ink-soft transition">Добавить склад</Link>
        </div>
      </div>
    );
  }

  const currentWarehouseId = selected?.id ?? allWarehouses[0].id;
  const currentWarehouseName = selected?.name ?? allWarehouses[0].name;
  const currentWarehouseKind = selected?.warehouse_kind ?? allWarehouses[0].warehouse_kind;

  const { data: seller } = await supabase
    .from("sellers")
    .select("created_at,currency")
    .eq("id", user.id)
    .maybeSingle();
  const daysSinceSetup = seller?.created_at ? Math.floor((Date.now() - new Date(seller.created_at).getTime()) / 86400_000) : 0;
  const currency = (seller as any)?.currency ?? "RUB";
  const fmt = (n: number | null | undefined) => formatMoney(n, currency);

  // ПРАВКА 29.05.2026: возраст данных склада для баннера «низкая точность».
  // Считаем от первого snapshot текущего склада. Если меньше 14 дней —
  // расчёты ещё нестабильны.
  // Запрос дешёвый: ORDER ASC LIMIT 1 на indexed колонке.
  const { data: oldestSnapshot } = await supabase
    .from("inventory_snapshots")
    .select("snapshot_time")
    .eq("connection_id", currentWarehouseId)
    .order("snapshot_time", { ascending: true })
    .limit(1)
    .maybeSingle();
  const daysOfWarehouseHistory = oldestSnapshot?.snapshot_time
    ? Math.floor((Date.now() - new Date(oldestSnapshot.snapshot_time).getTime()) / 86400_000)
    : 0;
  const showDataWarmupBanner = daysOfWarehouseHistory < 14;

  // ПРАВКА 10 этап 1 (25.05.2026): per-warehouse агрегаты в моменте.
  const { data: warehouseMetricsRows } = await supabase
    .rpc("get_warehouse_dashboard_metrics", {
      p_seller_id: user.id,
      p_connection_id: currentWarehouseId,
      p_period_days: periodDays,
    });
  const wm = (warehouseMetricsRows as any[] | null)?.[0] ?? null;

  // ПРАВКА 10 этап 2 (25.05.2026): per-warehouse история для графиков.
  const [warehouseHistoryRes, storeHistoryRes] = await Promise.all([
    supabase
      .from("warehouse_metrics")
      .select("period_end,warehouse_health_score,lost_revenue,total_inventory_value,store_frozen_inventory_value,dead_inventory_sku_count")
      .eq("seller_id", user.id)
      .eq("connection_id", currentWarehouseId)
      .order("period_end", { ascending: false })
      .limit(14),
    supabase
      .from("store_metrics")
      .select("period_end,warehouse_health_score,lost_revenue,total_inventory_value,store_frozen_inventory_value,dead_inventory_sku_count")
      .eq("seller_id", user.id)
      .order("period_end", { ascending: false })
      .limit(14),
  ]);
  const warehouseHistory = warehouseHistoryRes.data ?? [];
  const storeHistory = storeHistoryRes.data ?? [];

  const usingFallback = warehouseHistory.length === 0;
  const chartHistory = usingFallback ? storeHistory : warehouseHistory;

  // Оптимизация (2026-05-25): get_dashboard_velocities — DISTINCT ON по
  // product_id, ~0.5 сек на 3.7k SKU.
  const { data: velRows } = await supabase
    .rpc("get_dashboard_velocities", {
      p_seller_id: user.id,
      p_connection_id: currentWarehouseId,
    });
  const latestByProduct = new Map<string, { velocity: number; confidence: number | null }>();
  for (const m of (velRows ?? [])) {
    latestByProduct.set(m.product_id, {
      velocity: Number(m.adjusted_velocity),
      confidence: m.confidence_score == null ? null : Number(m.confidence_score),
    });
  }
  const velocities = Array.from(latestByProduct.values()).map(v => v.velocity).filter(v => v > 0).sort((a, b) => a - b);
  const fastVelocity = velocities.length > 0 ? velocities[Math.floor(velocities.length * 0.9)] : 0;
  const avgVelocity = velocities.length > 0 ? velocities.reduce((a, b) => a + b, 0) / velocities.length : 0;
  const slowVelocity = velocities.length > 0 ? velocities[Math.floor(velocities.length * 0.1)] : 0;

  const confidenceValues = Array.from(latestByProduct.values())
    .map(v => v.confidence)
    .filter((c): c is number => c != null);
  const avgConfidence = confidenceValues.length > 0
    ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length
    : null;

  const { data: alerts } = await supabase
    .from("alerts")
    .select("*")
    .eq("seller_id", user.id)
    .is("acknowledged_at", null)
    .order("created_at", { ascending: false })
    .limit(5);

  const showMultiWarehouseBanner = allWarehouses.length > 1;
  const showHistoryWarmup = usingFallback && allWarehouses.length > 1;

  const skusLink = (filter: string) => `/dashboard/skus?period=${period}&filter=${filter}` as any;

  // Тултип графиков динамики: если данных по конкретному складу ещё нет,
  // показываем агрегат по магазину с пометкой об этом.
  const trendTooltipSuffix = usingFallback
    ? "Пока показано по всему магазину — данные по конкретному складу ещё накапливаются."
    : `Только по складу «${currentWarehouseName}».`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-medium tracking-tight text-ink">Обзор склада</h1>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap text-sm text-ink-muted">
            <span className="size-1.5 rounded-full bg-lime-deep shrink-0" />
            <span className="font-medium text-ink truncate max-w-[180px] sm:max-w-none">{currentWarehouseName}</span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">
              {warehouseKindLabel(currentWarehouseKind)}
            </span>
          </div>
        </div>
        <PeriodSelector current={period} />
      </div>

      {showDataWarmupBanner && (
        <DataWarmupBanner days={daysOfWarehouseHistory} />
      )}

      {showMultiWarehouseBanner && (
        <div className="rounded-xl border border-lime-deep/30 bg-lime-soft/40 p-4 flex items-start gap-3">
          <span className="text-lime-deep mt-0.5 shrink-0 font-mono text-[10px] uppercase tracking-widest font-semibold">i</span>
          <div className="flex-1 text-sm">
            <div className="font-medium text-ink">Все цифры — для склада «{currentWarehouseName}»</div>
            <p className="mt-1 text-ink-muted">
              Счётчики, деньги, потери и здоровье склада посчитаны только по выбранному складу.
              {showHistoryWarmup
                ? " Графики динамики пока показывают весь магазин — данные по складу ещё накапливаются и переключатся автоматически."
                : " Графики динамики тоже по выбранному складу."} Переключайте склад в правом верхнем углу.
            </p>
          </div>
        </div>
      )}

      <DayProgress daysSinceSetup={daysSinceSetup} />

      {/* ===== ПОЛОСА 1: 3 средних блока ===== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ActionCard
          href={skusLink("low_stock")}
          label="Низкий остаток"
          tooltip="Товары которые закончатся быстрее чем за неделю при текущей скорости продаж. Пора заказывать пополнение."
          value={wm?.low_stock_sku_count ?? "—"}
          sub="закончатся через неделю, нужна поставка"
          tone="warn"
        />
        <ActionCard
          href={skusLink("lost_revenue")}
          label="Потерянная выручка"
          tooltip="Сколько денег вы недополучили из-за того что товар закончился на складе. Каждый день без товара — это упущенная выручка."
          value={fmt(wm?.lost_revenue)}
          sub="недополучено за период из-за отсутствия товара"
          tone="danger"
        />
        <ActionCard
          href={skusLink("dead_inventory")}
          label="Неликвид"
          tooltip="Товары которые продаются так медленно, что текущих остатков хватит больше чем на полгода. Деньги фактически заморожены — кандидаты на распродажу."
          value={wm?.dead_inventory_sku_count ?? "—"}
          sub="низкая скорость продаж"
          tone="warn"
        />
      </div>

      {/* ===== ПОЛОСА 2: 2 больших блока ===== */}
      <div className="grid gap-4 md:gap-6 md:grid-cols-2">
        <HealthScoreBlock score={wm?.warehouse_health_score} />

        <div className="rounded-2xl border border-line bg-paper p-4 sm:p-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold flex items-center">
            Денег на остатках
            <InfoTooltip text={`Сколько ваших ${currency === "RUB" ? "рублей" : "денег"} прямо сейчас лежит на складе в виде товара. Это замороженный оборотный капитал — пока товар не продан, деньги не работают.`} />
          </div>
          <div className="mt-3 font-display text-2xl sm:text-3xl md:text-5xl tracking-tight font-medium text-ink tabular break-words">
            {fmt(wm?.total_inventory_value)}
          </div>
          <div className="mt-4 rounded-lg border border-orange/20 bg-orange/5 p-3 flex items-center justify-between gap-3 flex-wrap">
            <span className="font-mono text-[10px] uppercase tracking-widest text-orange font-semibold flex items-center">
              Заморожено в неликвиде
              <InfoTooltip text="Деньги вложены в товары которые будут продаваться больше полугода. Эти средства работают плохо — кандидаты на распродажу, возврат поставщику или списание." />
            </span>
            <span className="font-display tabular text-lg sm:text-xl text-orange font-medium break-words">
              {fmt(wm?.store_frozen_inventory_value)}
            </span>
          </div>
        </div>
      </div>

      {/* ===== ПОЛОСА 3: 4 маленьких KPI ===== */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        <Kpi
          href={"/dashboard/skus" as any}
          label="Всего SKU"
          tooltip="Сколько разных артикулов у вас на этом складе."
          value={wm?.total_sku_count ?? "—"}
        />
        <Kpi
          href={skusLink("oos")}
          label="Нет в наличии"
          tooltip="Товары которых сейчас нет на складе, но они продавались в последний месяц. Срочно нужно пополнение."
          value={wm?.oos_sku_count ?? "—"}
          tone="warn"
        />
        <Kpi
          href={skusLink("inactive")}
          label="SKU без активности"
          tooltip="Товары которые закончились и больше не продаются. Возможно ушли из ассортимента — посмотрите, не пора ли вычистить."
          value={wm?.inactive_sku_count ?? "—"}
          tone="muted"
        />
        <Kpi
          label="Достоверность данных"
          tooltip="Насколько надёжны расчёты по этому складу. Чем дольше мы собираем данные, тем выше точность. После двух недель работы становится около 90%."
          value={avgConfidence != null ? `${avgConfidence.toFixed(0)}%` : "—"}
          tone="accent"
        />
      </div>

      {/* ===== ПОЛОСА 4: 3 средних — кликабельные ===== */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link href={skusLink("inventory_concentration")} className="group rounded-2xl border border-line bg-paper p-4 sm:p-5 hover:border-lime-deep/40 hover:shadow-sm transition cursor-pointer">
          <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush flex items-center">
            Концентрация остатков
            <InfoTooltip text="Сколько товаров держат половину всех ваших денег на складе. Маленькое число (например 5 из 1000) — большой риск: потерять 1-2 ключевых артикула значит потерять половину склада." />
          </div>
          <div className="mt-2 font-display text-2xl tabular text-ink font-medium">
            {wm?.inventory_concentration_50 ?? "—"} <span className="text-base text-ink-muted">SKU</span>
          </div>
          <div className="mt-1 text-xs text-ink-muted">дают 50% остатков по деньгам</div>
          <div className="mt-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush opacity-0 group-hover:opacity-100 transition">
            посмотреть →
          </div>
        </Link>
        <Link href={skusLink("demand_concentration")} className="group rounded-2xl border border-line bg-paper p-4 sm:p-5 hover:border-lime-deep/40 hover:shadow-sm transition cursor-pointer">
          <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush flex items-center">
            Концентрация спроса
            <InfoTooltip text="Сколько товаров приносят половину вашей выручки. Маленькое число — узкое горлышко: эти артикулы критичны, и потеря одного из них сильно ударит по обороту." />
          </div>
          <div className="mt-2 font-display text-2xl tabular text-ink font-medium">
            {wm?.demand_concentration_50 ?? "—"} <span className="text-base text-ink-muted">SKU</span>
          </div>
          <div className="mt-1 text-xs text-ink-muted">дают 50% спроса</div>
          <div className="mt-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush opacity-0 group-hover:opacity-100 transition">
            посмотреть →
          </div>
        </Link>
        <Link href={skusLink("frequently_oos")} className="group rounded-2xl border border-orange/30 bg-orange/5 p-4 sm:p-5 hover:border-orange/50 hover:shadow-sm transition cursor-pointer">
          <div className="font-mono text-[10px] uppercase tracking-widest text-orange font-semibold flex items-center">
            Часто отсутствуют на складе
            <InfoTooltip text="Товары которые за прошлый месяц отсутствовали на складе больше двух недель в сумме. Регулярный дефицит — повод проверить логистику или ритм закупок." />
          </div>
          <div className="mt-2 font-display text-2xl tabular text-orange font-medium">
            {wm?.frequently_oos_sku_count ?? "—"} <span className="text-base text-orange/70">SKU</span>
          </div>
          <div className="mt-1 text-xs text-orange/80">отсутствовали на складе более 15 дней за месяц</div>
          <div className="mt-3 font-mono text-[10px] uppercase tracking-widest text-orange opacity-0 group-hover:opacity-100 transition">
            посмотреть →
          </div>
        </Link>
      </div>

      {/* ===== ПОЛОСА 5: 3 скорости продаж ===== */}
      <div>
        <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold mb-3 flex items-center flex-wrap">
          <span>Скорости продаж по SKU склада «{currentWarehouseName}»</span>
          <InfoTooltip text="Как распределяется скорость продаж по вашим товарам. Видно где бестселлеры, где середняки, а где медленные товары которые тянут вас вниз." />
        </h3>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <VelocityCard label="Быстрая" value={fastVelocity} sub="топ 10% SKU" tone="fast" tooltip="Скорость ваших бестселлеров — топ-10% самых быстрых товаров. На них держится выручка склада." />
          <VelocityCard label="Средняя" value={avgVelocity}  sub="по всем SKU"  tone="mid"  tooltip="Среднее по всем активным товарам склада. Базовая планка с которой стоит сравнивать новые позиции." />
          <VelocityCard label="Медленная" value={slowVelocity} sub="нижние 10%" tone="slow" tooltip="Скорость самых медленных товаров — нижние 10%. Кандидаты на распродажу или вывод из ассортимента." />
        </div>
      </div>

      {/* ===== ПОЛОСА 6: Графики ===== */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title={`Здоровье склада за ${chartHistory.length || 14} ${pluralize(chartHistory.length || 14, "точку", "точки", "точек")}`}
          tooltip={`Как меняется общее состояние склада со временем. Чем выше тем лучше: 70+ зелёная зона, 40-70 жёлтая, ниже 40 — внимание. ${trendTooltipSuffix}`}
        >
          <HealthTrend history={chartHistory} />
        </ChartCard>
        <ChartCard
          title="Потерянная выручка"
          tooltip={`Динамика потерь из-за того что товар был распродан. Растёт — теряете больше, падает — справляетесь с закупками. ${trendTooltipSuffix}`}
        >
          <LostRevenueTrend history={chartHistory} currency={currency} />
        </ChartCard>
        <ChartCard title="Распределение по сегментам" tooltip="Как разбит ваш ассортимент по характеру спроса: стабильные товары, быстрые, медленные, неликвид и те по которым ещё мало данных.">
          <SegmentPie distribution={wm?.demand_pattern_distribution as any} />
        </ChartCard>
      </div>

      {/* ===== ПОЛОСА 7: Dead inventory ===== */}
      <div className="rounded-2xl border border-line bg-paper p-4 sm:p-6">
        <h3 className="font-display text-base sm:text-lg font-medium text-ink flex items-center flex-wrap">
          <span>Неликвид (товары &gt; 6 месяцев)</span>
          <InfoTooltip text={`Как меняется со временем количество неликвидных товаров и сколько денег в них заморожено. ${trendTooltipSuffix}`} position="bottom" />
        </h3>
        <p className="text-xs text-ink-muted mt-1 mb-4">Динамика количества SKU и замороженных денег</p>
        <DeadInventoryChart history={chartHistory} currency={currency} />
      </div>

      {alerts && alerts.length > 0 && (
        <div className="rounded-2xl border border-line bg-paper p-4 sm:p-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-display text-lg font-medium text-ink">Последние события</h2>
            <Link href={"/dashboard/alerts" as any} className="text-xs font-mono uppercase tracking-wider text-lime-deep hover:underline">
              Все отчёты →
            </Link>
          </div>
          <ul className="mt-3 space-y-2">
            {alerts.map((a) => (
              <li key={a.id} className="rounded-lg border border-line bg-bg-soft p-3 text-sm text-ink-soft">
                <span className="font-mono text-[10px] uppercase tracking-widest text-orange font-semibold mr-2">{kindLabel(a.kind)}</span>
                {a.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Баннер «низкая точность данных» — показывается когда у склада < 14 дней истории.
 * Три уровня по дням:
 *   0-3   красный   «практически нет данных»
 *   4-7   оранжевый «данных мало»
 *   8-13  жёлтый    «накапливается»
 */
function DataWarmupBanner({ days }: { days: number }) {
  let tone: "danger" | "warn" | "soft" = "soft";
  let label = "";
  let detail = "";

  if (days <= 3) {
    tone = "danger";
    label = days === 0
      ? "По этому складу пока ничего не считалось"
      : `Данных всего ${days} ${pluralize(days, "день", "дня", "дней")}`;
    detail = "Все цифры — приблизительные. Скорость, покрытие, неликвид, потерянная выручка стабилизируются через две недели. Подождите неделю и возвращайтесь — будет принципиально другая картина.";
  } else if (days <= 7) {
    tone = "warn";
    label = `Данных ${days} ${pluralize(days, "день", "дня", "дней")} — точность низкая`;
    detail = "Расчёты ещё не вышли на плато. Скорость и покрытие могут заметно меняться каждый день. Через две недели цифры станут устойчивыми.";
  } else {
    tone = "soft";
    label = `Данных ${days} ${pluralize(days, "день", "дня", "дней")} из двух недель минимально нужных`;
    detail = "Уже видно общую картину, но расчёты ещё уточняются. Через несколько дней цифры станут стабильными.";
  }

  const classes = {
    danger: "border-rose/30 bg-rose/5",
    warn:   "border-orange/30 bg-orange/5",
    soft:   "border-azure/30 bg-azure/5",
  }[tone];
  const dotClasses = {
    danger: "bg-rose",
    warn:   "bg-orange",
    soft:   "bg-azure",
  }[tone];
  const labelClasses = {
    danger: "text-rose",
    warn:   "text-orange",
    soft:   "text-azure",
  }[tone];

  return (
    <div className={`rounded-xl border ${classes} p-4 flex items-start gap-3`}>
      <span className={`${dotClasses} size-2 rounded-full mt-2 shrink-0`} />
      <div className="flex-1 text-sm">
        <div className={`font-medium ${labelClasses}`}>{label}</div>
        <p className="mt-1 text-ink-muted leading-relaxed">{detail}</p>
      </div>
    </div>
  );
}

function ActionCard({ href, label, value, sub, tone, tooltip }: {
  href?: string;
  label: string;
  value: React.ReactNode;
  sub: string;
  tone: "warn" | "danger";
  tooltip?: string;
}) {
  const toneClasses = tone === "danger"
    ? "border-rose/30 bg-rose/5 hover:border-rose/50"
    : "border-orange/30 bg-orange/5 hover:border-orange/50";
  const labelColor = tone === "danger" ? "text-rose" : "text-orange";
  const valueColor = tone === "danger" ? "text-rose" : "text-orange";
  const subColor = tone === "danger" ? "text-rose/80" : "text-orange/80";

  const inner = (
    <div className={`group rounded-2xl border-2 p-4 sm:p-5 transition ${toneClasses} ${href ? "cursor-pointer hover:shadow-md" : ""}`}>
      <div className={`font-mono text-[10px] uppercase tracking-widest font-semibold flex items-center ${labelColor}`}>
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <div className={`mt-2 font-display text-2xl sm:text-3xl md:text-4xl tabular font-medium tracking-tight break-words ${valueColor}`}>
        {value}
      </div>
      <div className={`mt-1.5 text-xs leading-relaxed ${subColor}`}>{sub}</div>
      {href && (
        <div className={`mt-3 font-mono text-[10px] uppercase tracking-widest ${labelColor} opacity-0 group-hover:opacity-100 transition`}>
          посмотреть →
        </div>
      )}
    </div>
  );

  return href ? <Link href={href as any}>{inner}</Link> : inner;
}

function Kpi({ href, label, value, tone, tooltip }: {
  href?: string;
  label: string;
  value: React.ReactNode;
  tone?: "warn" | "muted" | "accent";
  tooltip?: string;
}) {
  const valueColor =
    tone === "warn"   ? "text-orange" :
    tone === "muted"  ? "text-ink-hush" :
    tone === "accent" ? "text-lime-deep" :
                        "text-ink";

  const inner = (
    <div className={`rounded-2xl border border-line bg-paper p-3 sm:p-4 transition ${href ? "hover:border-lime-deep/40 hover:shadow-sm cursor-pointer" : ""}`}>
      <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush flex items-center">
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <div className={`mt-1.5 font-display text-xl sm:text-2xl md:text-3xl tabular font-medium tracking-tight ${valueColor}`}>
        {value}
      </div>
    </div>
  );

  return href ? <Link href={href as any}>{inner}</Link> : inner;
}

function VelocityCard({ label, value, sub, tone, tooltip }: { label: string; value: number; sub: string; tone: "fast" | "mid" | "slow"; tooltip?: string }) {
  const cls =
    tone === "fast" ? "border-l-lime-deep text-lime-deep" :
    tone === "mid"  ? "border-l-azure text-azure" :
                      "border-l-orange text-orange";
  return (
    <div className={`bg-paper border border-line border-l-4 rounded-xl p-3 sm:p-4 ${cls.replace("text-", "")}`}>
      <div className="font-mono text-[9px] sm:text-[10px] uppercase tracking-widest text-ink-hush flex items-center">
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <div className={`mt-1 font-display text-lg sm:text-xl md:text-2xl tabular font-medium ${cls.split(" ")[1]}`}>{value.toFixed(2)}</div>
      <div className="text-[9px] sm:text-[10px] text-ink-hush mt-0.5 font-mono uppercase tracking-wider">{sub}</div>
    </div>
  );
}

function ChartCard({ title, children, tooltip }: { title: string; children: React.ReactNode; tooltip?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-4 sm:p-6">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold mb-3 flex items-center">
        {title}
        {tooltip && <InfoTooltip text={tooltip} />}
      </h3>
      {children}
    </div>
  );
}

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function kindLabel(kind: string): string {
  return {
    low_stock: "Низкий остаток",
    critical_stock: "Критический остаток",
    dead_inventory: "Неликвид",
    repeated_stockout: "Повторный дефицит",
    underestimated_sku: "Недооценённый SKU",
  }[kind] ?? kind;
}
