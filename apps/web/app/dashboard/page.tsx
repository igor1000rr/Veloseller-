import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import RecalcButton from "./RecalcButton";
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
    // Правка Александра: текст empty-state синхронизирован с /onboarding —
    // про "актуальные расчёты через 7 дней, наиболее точные через 30 дней".
    return (
      <div className="rounded-2xl border border-line bg-paper p-8 md:p-10 text-center">
        <h1 className="font-display text-2xl md:text-3xl font-medium text-ink">Подключите первый склад</h1>
        <p className="mx-auto mt-3 max-w-xl text-ink-muted leading-relaxed">
          Чтобы Veloseller начал считать TVelo, нужны ежедневные записи по вашим SKU.
          Актуальные расчёты через 7 дней. Наиболее точные показатели через 30 дней.
          Мы отправим вам на email сводные отчёты за эти даты.
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

  const periodStartDate = new Date(Date.now() - periodDays * 86400_000);
  const periodStartIso = periodStartDate.toISOString().slice(0, 10);
  const { data: storeMetricsRows } = await supabase
    .from("store_metrics")
    .select("*")
    .eq("seller_id", user.id)
    .gte("period_start", periodStartIso)
    .order("computed_at", { ascending: false })
    .limit(20);
  const storeMetrics = (storeMetricsRows ?? []).find((r: any) => {
    const len = Math.round((new Date(r.period_end).getTime() - new Date(r.period_start).getTime()) / 86400_000);
    return Math.abs(len - (periodDays - 1)) <= 1;
  }) ?? (storeMetricsRows?.[0] ?? null);

  const { data: storeHistory } = await supabase
    .from("store_metrics")
    .select("period_end,warehouse_health_score,lost_revenue,total_inventory_value,store_frozen_inventory_value,dead_inventory_sku_count")
    .eq("seller_id", user.id)
    .order("period_end", { ascending: false })
    .limit(14);

  // Оптимизация (2026-05-25): раньше fetchAll пагинировал ~45k строк
  // tvelo_metrics последовательно (≈2-4 сек), хотя нужна только первая
  // запись на каждый product_id (~3.7k). Заменено на RPC с DISTINCT ON
  // → один round-trip, ~0.5 сек на холодном кэше.
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
  // confidence_score в БД хранится в процентах (0-100), НЕ в долях.
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

  const skusLink = (filter: string) => `/dashboard/skus?period=${period}&filter=${filter}` as any;

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
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <PeriodSelector current={period} />
          <RecalcButton />
        </div>
      </div>

      {showMultiWarehouseBanner && (
        <div className="rounded-xl border border-azure/30 bg-azure/5 p-4 flex items-start gap-3">
          <span className="text-azure mt-0.5 shrink-0"><InfoTooltip text="" /></span>
          <div className="flex-1 text-sm">
            <div className="font-medium text-ink">У вас несколько складов</div>
            <p className="mt-1 text-ink-muted">
              TVelo и список SKU показаны для выбранного склада <b>{currentWarehouseName}</b>.
              Агрегаты «Денег на остатках», «Здоровье склада», «Концентрация» и «Неликвид» пока считаются
              суммарно по всем складам (per-склад агрегаты в разработке). Переключитесь на другой склад
              через селектор в правом верхнем углу.
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
          tooltip="SKU где coverage_days ≤ 7 — закончится за неделю при текущей скорости продаж."
          value={storeMetrics?.low_stock_sku_count ?? "—"}
          sub="закончатся через неделю, нужна поставка"
          tone="warn"
        />
        <ActionCard
          href={skusLink("lost_revenue")}
          label="Потерянная выручка"
          tooltip="Σ (adjusted_velocity × stockout_days × avg_price) по всем SKU. Сколько денег не получено из-за того что товар был out-of-stock."
          value={fmt(storeMetrics?.lost_revenue)}
          sub="недополучено за период из-за отсутствия товара"
          tone="danger"
        />
        <ActionCard
          href={skusLink("dead_inventory")}
          label="Неликвид"
          tooltip="SKU где coverage_days > 180 — продаваться будет дольше 6 месяцев. Деньги заморожены в товаре."
          value={storeMetrics?.dead_inventory_sku_count ?? "—"}
          sub="низкая скорость продаж"
          tone="warn"
        />
      </div>

      {/* ===== ПОЛОСА 2: 2 больших блока ===== */}
      <div className="grid gap-4 md:gap-6 md:grid-cols-2">
        <HealthScoreBlock score={storeMetrics?.warehouse_health_score} />

        <div className="rounded-2xl border border-line bg-paper p-4 sm:p-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold flex items-center">
            Денег на остатках
            <InfoTooltip text={`Σ stock_quantity × current_price по всем SKU. Сколько ${currency === "RUB" ? "рублей" : "денег"} лежит на складе в виде товара — это твой замороженный оборотный капитал.`} />
          </div>
          <div className="mt-3 font-display text-2xl sm:text-3xl md:text-5xl tracking-tight font-medium text-ink tabular break-words">
            {fmt(storeMetrics?.total_inventory_value)}
          </div>
          <div className="mt-4 rounded-lg border border-orange/20 bg-orange/5 p-3 flex items-center justify-between gap-3 flex-wrap">
            <span className="font-mono text-[10px] uppercase tracking-widest text-orange font-semibold flex items-center">
              Заморожено в неликвиде
              <InfoTooltip text="Деньги в SKU с coverage > 180 дней. Эти средства фактически не работают — товар будет продаваться полгода+. Кандидаты на распродажу, возврат поставщику или списание." />
            </span>
            <span className="font-display tabular text-lg sm:text-xl text-orange font-medium break-words">
              {fmt(storeMetrics?.store_frozen_inventory_value)}
            </span>
          </div>
        </div>
      </div>

      {/* ===== ПОЛОСА 3: 4 маленьких KPI ===== */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        <Kpi
          href={"/dashboard/skus" as any}
          label="Всего SKU"
          tooltip="Количество товарных позиций, засинкованных из подключённого источника."
          value={storeMetrics?.total_sku_count ?? "—"}
        />
        <Kpi
          href={skusLink("oos")}
          label="Нет в наличии"
          tooltip="Товары с нулевым остатком, по которым было движение за последние 30 дней."
          value={storeMetrics?.oos_sku_count ?? "—"}
          tone="warn"
        />
        <Kpi
          href={skusLink("inactive")}
          label="SKU без активности"
          tooltip="Товары с нулевым остатком и без движений за последние 30 дней. Не участвуют в расчётах."
          value={storeMetrics?.inactive_sku_count ?? "—"}
          tone="muted"
        />
        <Kpi
          label="Достоверность данных"
          tooltip="Средняя достоверность данных по магазину. Чем больше дней снимаем snapshots — тем выше показатель."
          value={avgConfidence != null ? `${avgConfidence.toFixed(0)}%` : "—"}
          tone="accent"
        />
      </div>

      {/* ===== ПОЛОСА 4: 3 средних — теперь кликабельные (правка 4) ===== */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link href={skusLink("inventory_concentration")} className="group rounded-2xl border border-line bg-paper p-4 sm:p-5 hover:border-lime-deep/40 hover:shadow-sm transition cursor-pointer">
          <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush flex items-center">
            Концентрация остатков
            <InfoTooltip text="Сколько топ-SKU держат 50% всех денег в остатках. Малое число (например 5-10 из 1000) = большая концентрация: потерять 1-2 ключевых SKU = потерять половину склада." />
          </div>
          <div className="mt-2 font-display text-2xl tabular text-ink font-medium">
            {storeMetrics?.inventory_concentration_50 ?? "—"} <span className="text-base text-ink-muted">SKU</span>
          </div>
          <div className="mt-1 text-xs text-ink-muted">дают 50% остатков по деньгам</div>
          <div className="mt-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush opacity-0 group-hover:opacity-100 transition">
            посмотреть →
          </div>
        </Link>
        <Link href={skusLink("demand_concentration")} className="group rounded-2xl border border-line bg-paper p-4 sm:p-5 hover:border-lime-deep/40 hover:shadow-sm transition cursor-pointer">
          <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush flex items-center">
            Концентрация спроса
            <InfoTooltip text="Сколько SKU создают 50% всего спроса (скорость × цена). Маленькое число = узкое горлышко: эти SKU критичны для выручки, дефицит по ним = крупные потери." />
          </div>
          <div className="mt-2 font-display text-2xl tabular text-ink font-medium">
            {storeMetrics?.demand_concentration_50 ?? "—"} <span className="text-base text-ink-muted">SKU</span>
          </div>
          <div className="mt-1 text-xs text-ink-muted">дают 50% спроса</div>
          <div className="mt-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush opacity-0 group-hover:opacity-100 transition">
            посмотреть →
          </div>
        </Link>
        <Link href={skusLink("frequently_oos")} className="group rounded-2xl border border-orange/30 bg-orange/5 p-4 sm:p-5 hover:border-orange/50 hover:shadow-sm transition cursor-pointer">
          <div className="font-mono text-[10px] uppercase tracking-widest text-orange font-semibold flex items-center">
            Часто отсутствуют на складе
            <InfoTooltip text="Товары, которые более 15 дней за последний месяц отсутствовали на складе. Регулярный дефицит — повод проверить логистику или закупку." />
          </div>
          <div className="mt-2 font-display text-2xl tabular text-orange font-medium">
            {storeMetrics?.frequently_oos_sku_count ?? "—"} <span className="text-base text-orange/70">SKU</span>
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
          <InfoTooltip text="Распределение adjusted_velocity (штук в день) по всем SKU выбранного склада. Быстрая = 90-й перцентиль, Средняя = mean, Медленная = 10-й перцентиль. Помогает понять структуру ассортимента." />
        </h3>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <VelocityCard label="Быстрая" value={fastVelocity} sub="топ 10% SKU" tone="fast" tooltip="P90: 90% SKU продаются медленнее, 10% — быстрее. Это твои бестселлеры." />
          <VelocityCard label="Средняя" value={avgVelocity}  sub="по всем SKU"  tone="mid"  tooltip="Арифметическое среднее скорости продаж по всем активным SKU. Хороший baseline для сравнения." />
          <VelocityCard label="Медленная" value={slowVelocity} sub="нижние 10%" tone="slow" tooltip="P10: 90% SKU продаются быстрее. Кандидаты на оптимизацию ассортимента." />
        </div>
      </div>

      {/* ===== ПОЛОСА 6: Графики ===== */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Здоровье склада за 14 дней" tooltip="Изменение warehouse_health_score за последние 14 пересчётов. Тренд вверх = склад здоровеет, вниз = ухудшение.">
          <HealthTrend history={storeHistory ?? []} />
        </ChartCard>
        <ChartCard title="Потерянная выручка за 14 дней" tooltip="Динамика потерь из-за отсутствия товара. Если растёт — нужно срочно пополнять дефицитные SKU.">
          <LostRevenueTrend history={storeHistory ?? []} currency={currency} />
        </ChartCard>
        <ChartCard title="Распределение по сегментам" tooltip="Сегментация SKU по паттерну спроса: стабильные, быстрые, медленные, неликвид, мало данных.">
          <SegmentPie distribution={storeMetrics?.demand_pattern_distribution as any} />
        </ChartCard>
      </div>

      {/* ===== ПОЛОСА 7: Dead inventory ===== */}
      <div className="rounded-2xl border border-line bg-paper p-4 sm:p-6">
        <h3 className="font-display text-base sm:text-lg font-medium text-ink flex items-center flex-wrap">
          <span>Неликвид (товары &gt; 6 месяцев)</span>
          <InfoTooltip text="SKU с coverage > 180 дней. Динамика количества (левая ось) и денег (правая). Если растёт — закупка неэффективна, надо разбираться." position="bottom" />
        </h3>
        <p className="text-xs text-ink-muted mt-1 mb-4">Динамика количества SKU и замороженных денег</p>
        <DeadInventoryChart history={storeHistory ?? []} currency={currency} />
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

function kindLabel(kind: string): string {
  return {
    low_stock: "Низкий остаток",
    critical_stock: "Критический остаток",
    dead_inventory: "Неликвид",
    repeated_stockout: "Повторный дефицит",
    underestimated_sku: "Недооценённый SKU",
  }[kind] ?? kind;
}
