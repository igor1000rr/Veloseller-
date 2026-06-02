import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { HealthTrend, LostRevenueTrend, SegmentPie, PotentialRevenueChart } from "./StoreCharts";
import { DayProgress } from "./DayProgress";
import { PeriodSelector } from "./PeriodSelector";
import { DeadInventoryChart } from "./StoreCharts";
import { HealthScoreBlock } from "./HealthScale";
import { formatMoney } from "@/lib/format-money";
import { InfoTooltip } from "../_components/InfoTooltip";
import { getSelectedWarehouse, listWarehouses, warehouseKindLabel } from "@/lib/warehouse";
import { t, plural } from "@/lib/i18n";

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
        <h1 className="font-display text-2xl md:text-3xl font-medium text-ink">{t("dashboard.empty.title")}</h1>
        <p className="mx-auto mt-3 max-w-xl text-ink-muted leading-relaxed">
          {t("dashboard.empty.text")}
        </p>
        <div className="mt-6 flex gap-3 justify-center flex-wrap">
          <Link href={"/onboarding" as any} className="inline-flex items-center rounded-lg border border-line bg-bg-soft text-ink px-5 py-3 font-semibold hover:border-lime-deep/40 transition">{t("dashboard.empty.guideBtn")}</Link>
          <Link href={"/connections/new" as any} className="inline-flex items-center rounded-lg bg-ink text-paper px-5 py-3 font-semibold hover:bg-ink-soft transition">{t("dashboard.empty.addBtn")}</Link>
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
  // Александр 01.06.2026: серый info-баннер «Данных N дней из двух недель»
  // больше не показываем — эту же информацию даёт блок DayProgress ниже
  // (День 10 / Подключение X% / TVelo работает). Оставляем баннер ТОЛЬКО
  // для реально критичных случаев — первые 7 дней, когда цифры приблизительные
  // и пользователь должен это явно увидеть.
  const showDataWarmupBanner = daysOfWarehouseHistory <= 7;

  const { data: warehouseMetricsRows } = await supabase
    .rpc("get_warehouse_dashboard_metrics", {
      p_seller_id: user.id,
      p_connection_id: currentWarehouseId,
      p_period_days: periodDays,
    });
  const wm = (warehouseMetricsRows as any[] | null)?.[0] ?? null;

  const [warehouseHistoryRes, storeHistoryRes] = await Promise.all([
    supabase
      .from("warehouse_metrics")
      .select("period_end,warehouse_health_score,lost_revenue,total_inventory_value,store_frozen_inventory_value,dead_inventory_sku_count,potential_revenue")
      .eq("seller_id", user.id)
      .eq("connection_id", currentWarehouseId)
      .order("period_end", { ascending: false })
      .limit(14),
    supabase
      .from("store_metrics")
      .select("period_end,warehouse_health_score,lost_revenue,total_inventory_value,store_frozen_inventory_value,dead_inventory_sku_count,potential_revenue")
      .eq("seller_id", user.id)
      .order("period_end", { ascending: false })
      .limit(14),
  ]);
  const warehouseHistory = warehouseHistoryRes.data ?? [];
  const storeHistory = storeHistoryRes.data ?? [];

  const usingFallback = warehouseHistory.length === 0;
  const chartHistory = usingFallback ? storeHistory : warehouseHistory;

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

  const { data: alerts } = await supabase
    .from("alerts")
    .select("*")
    .eq("seller_id", user.id)
    .is("acknowledged_at", null)
    .order("created_at", { ascending: false })
    .limit(5);

  const skusLink = (filter: string) => `/dashboard/skus?period=${period}&filter=${filter}` as any;

  // Подпись для тултипов графиков (поверх warehouse vs store fallback).
  const trendTooltipSuffix = usingFallback
    ? t("dashboard.suffix.fallback")
    : t("dashboard.suffix.warehouse", { warehouse: currentWarehouseName });

  // Активные SKU = total_sku - inactive_sku (товары с остатком > 0 ИЛИ
  // продажами за 30 дней; "inactive" — без остатков И без продаж).
  // Заменяет блок "Достоверность данных" по правке Александра 01.06.2026.
  const activeSkuCount = wm
    ? Math.max(0, Number(wm.total_sku_count ?? 0) - Number(wm.inactive_sku_count ?? 0))
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-medium tracking-tight text-ink">{t("dashboard.title")}</h1>
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

      <DayProgress daysSinceSetup={daysSinceSetup} />

      {/* ===== ПОЛОСА 1: 3 средних блока ===== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ActionCard
          href={skusLink("low_stock")}
          label={t("dashboard.card.lowStock.label")}
          tooltip={t("dashboard.card.lowStock.tip")}
          value={wm?.low_stock_sku_count ?? "—"}
          sub={t("dashboard.card.lowStock.sub")}
          tone="warn"
        />
        <ActionCard
          href={skusLink("lost_revenue")}
          label={t("dashboard.card.lostRevenue.label")}
          tooltip={t("dashboard.card.lostRevenue.tip")}
          value={fmt(wm?.lost_revenue)}
          sub={t("dashboard.card.lostRevenue.sub")}
          tone="danger"
        />
        <ActionCard
          href={skusLink("dead_inventory")}
          label={t("dashboard.card.dead.label")}
          tooltip={t("dashboard.card.dead.tip")}
          value={wm?.dead_inventory_sku_count ?? "—"}
          sub={t("dashboard.card.dead.sub")}
          tone="warn"
        />
      </div>

      {/* ===== ПОЛОСА 2: 2 больших блока ===== */}
      <div className="grid gap-4 md:gap-6 md:grid-cols-2">
        <HealthScoreBlock
          score={wm?.warehouse_health_score}
          tooltip={t("dashboard.health.tip")}
        />

        <div className="rounded-2xl border border-line bg-paper p-4 sm:p-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold flex items-center">
            {t("dashboard.inventoryValue.label")}
            <InfoTooltip text={t("dashboard.inventoryValue.tip")} />
          </div>
          <div className="mt-3 font-display text-2xl sm:text-3xl md:text-5xl tracking-tight font-medium text-ink tabular break-words">
            {fmt(wm?.total_inventory_value)}
          </div>
          <div className="mt-4 rounded-lg border border-orange/20 bg-orange/5 p-3 flex items-center justify-between gap-3 flex-wrap">
            <span className="font-mono text-[10px] uppercase tracking-widest text-orange font-semibold flex items-center">
              {t("dashboard.frozen.label")}
              <InfoTooltip text={t("dashboard.frozen.tip")} />
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
          label={t("dashboard.kpi.totalSku.label")}
          tooltip={t("dashboard.kpi.totalSku.tip")}
          value={wm?.total_sku_count ?? "—"}
        />
        <Kpi
          href={skusLink("oos")}
          label={t("dashboard.kpi.oos.label")}
          tooltip={t("dashboard.kpi.oos.tip")}
          value={wm?.oos_sku_count ?? "—"}
          tone="warn"
        />
        <Kpi
          href={skusLink("inactive")}
          label={t("dashboard.kpi.inactive.label")}
          tooltip={t("dashboard.kpi.inactive.tip")}
          value={wm?.inactive_sku_count ?? "—"}
          tone="muted"
        />
        {/* Александр 01.06.2026: вместо "Достоверность данных" — "Активные товары" */}
        <Kpi
          href={skusLink("active")}
          label={t("dashboard.kpi.active.label")}
          tooltip={t("dashboard.kpi.active.tip")}
          value={activeSkuCount > 0 ? activeSkuCount : "—"}
          tone="accent"
        />
      </div>

      {/* ===== ПОЛОСА 4: 3 средних — кликабельные ===== */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link href={skusLink("inventory_concentration")} className="group rounded-2xl border border-line bg-paper p-4 sm:p-5 hover:border-lime-deep/40 hover:shadow-sm transition cursor-pointer">
          <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush flex items-center">
            {t("dashboard.conc.inventory.label")}
            <InfoTooltip text={t("dashboard.conc.inventory.tip")} />
          </div>
          <div className="mt-2 font-display text-2xl tabular text-ink font-medium">
            {wm?.inventory_concentration_50 ?? "—"} <span className="text-base text-ink-muted">SKU</span>
          </div>
          <div className="mt-1 text-xs text-ink-muted">{t("dashboard.conc.inventory.sub")}</div>
          <div className="mt-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush opacity-0 group-hover:opacity-100 transition">
            {t("dashboard.viewMore")}
          </div>
        </Link>
        <Link href={skusLink("demand_concentration")} className="group rounded-2xl border border-line bg-paper p-4 sm:p-5 hover:border-lime-deep/40 hover:shadow-sm transition cursor-pointer">
          <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush flex items-center">
            {t("dashboard.conc.demand.label")}
            <InfoTooltip text={t("dashboard.conc.demand.tip")} />
          </div>
          <div className="mt-2 font-display text-2xl tabular text-ink font-medium">
            {wm?.demand_concentration_50 ?? "—"} <span className="text-base text-ink-muted">SKU</span>
          </div>
          <div className="mt-1 text-xs text-ink-muted">{t("dashboard.conc.demand.sub")}</div>
          <div className="mt-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush opacity-0 group-hover:opacity-100 transition">
            {t("dashboard.viewMore")}
          </div>
        </Link>
        <Link href={skusLink("frequently_oos")} className="group rounded-2xl border border-orange/30 bg-orange/5 p-4 sm:p-5 hover:border-orange/50 hover:shadow-sm transition cursor-pointer">
          <div className="font-mono text-[10px] uppercase tracking-widest text-orange font-semibold flex items-center">
            {t("dashboard.conc.oos.label")}
            <InfoTooltip text={t("dashboard.conc.oos.tip")} />
          </div>
          <div className="mt-2 font-display text-2xl tabular text-orange font-medium">
            {wm?.frequently_oos_sku_count ?? "—"} <span className="text-base text-orange/70">SKU</span>
          </div>
          <div className="mt-1 text-xs text-orange/80">{t("dashboard.conc.oos.sub")}</div>
          <div className="mt-3 font-mono text-[10px] uppercase tracking-widest text-orange opacity-0 group-hover:opacity-100 transition">
            {t("dashboard.viewMore")}
          </div>
        </Link>
      </div>

      {/* ===== ПОЛОСА 5: 3 скорости продаж ===== */}
      <div>
        <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold mb-3 flex items-center flex-wrap">
          <span>{t("dashboard.velocity.header", { warehouse: currentWarehouseName })}</span>
          <InfoTooltip text={t("dashboard.velocity.headerTip")} />
        </h3>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <VelocityCard label={t("dashboard.velocity.fast.label")} value={fastVelocity} sub={t("dashboard.velocity.fast.sub")} tone="fast" tooltip={t("dashboard.velocity.fast.tip")} />
          <VelocityCard label={t("dashboard.velocity.mid.label")} value={avgVelocity}  sub={t("dashboard.velocity.mid.sub")}  tone="mid"  tooltip={t("dashboard.velocity.mid.tip")} />
          <VelocityCard label={t("dashboard.velocity.slow.label")} value={slowVelocity} sub={t("dashboard.velocity.slow.sub")} tone="slow" tooltip={t("dashboard.velocity.slow.tip")} />
        </div>
      </div>

      {/* ===== ПОЛОСА 6: Графики ===== */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title={t("dashboard.chart.health.title", { n: chartHistory.length || 14, unit: plural(chartHistory.length || 14, "unit.days") })}
          tooltip={t("dashboard.chart.health.tip", { suffix: trendTooltipSuffix })}
        >
          <HealthTrend history={chartHistory} />
        </ChartCard>
        <ChartCard
          title={t("dashboard.card.lostRevenue.label")}
          tooltip={t("dashboard.chart.lostRevenue.tip", { suffix: trendTooltipSuffix })}
        >
          <LostRevenueTrend history={chartHistory} currency={currency} />
        </ChartCard>
        <ChartCard
          title={t("dashboard.chart.segments.title")}
          tooltip={t("dashboard.chart.segments.tip")}
        >
          <SegmentPie distribution={wm?.demand_pattern_distribution as any} />
        </ChartCard>
      </div>

      {/* ===== ПОЛОСА 7: Неликвид (1/2) + Потенциальная выручка (1/2) =====
          Александр 01.06.2026: блок Неликвид сделать на пол страницы +
          добавить блок с графиком "Потенциальная выручка" — SUM(TVelo * Price)
      */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-line bg-paper p-4 sm:p-6">
          <h3 className="font-display text-base sm:text-lg font-medium text-ink flex items-center flex-wrap">
            <span>{t("dashboard.dead.title")}</span>
            <InfoTooltip text={t("dashboard.dead.tip", { suffix: trendTooltipSuffix })} position="bottom" />
          </h3>
          <p className="text-xs text-ink-muted mt-1 mb-4">{t("dashboard.dead.sub")}</p>
          <DeadInventoryChart history={chartHistory} currency={currency} />
        </div>

        <div className="rounded-2xl border border-line bg-paper p-4 sm:p-6">
          <h3 className="font-display text-base sm:text-lg font-medium text-ink flex items-center flex-wrap">
            <span>{t("dashboard.potential.title")}</span>
            <InfoTooltip text={t("dashboard.potential.tip", { suffix: trendTooltipSuffix })} position="bottom" />
          </h3>
          <p className="text-xs text-ink-muted mt-1 mb-4">{t("dashboard.potential.sub")}</p>
          <PotentialRevenueChart history={chartHistory} currency={currency} />
        </div>
      </div>

      {alerts && alerts.length > 0 && (
        <div className="rounded-2xl border border-line bg-paper p-4 sm:p-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-display text-lg font-medium text-ink">{t("dashboard.alerts.title")}</h2>
            <Link href={"/dashboard/alerts" as any} className="text-xs font-mono uppercase tracking-wider text-lime-deep hover:underline">
              {t("dashboard.alerts.viewAll")}
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

function DataWarmupBanner({ days }: { days: number }) {
  // Александр 01.06.2026: soft-вариант (8-13 дней) убран как избыточный —
  // эту же информацию показывает блок DayProgress ниже. Здесь оставлены
  // только реально критичные предупреждения для первых 7 дней.
  let tone: "danger" | "warn" = "warn";
  let label = "";
  let detail = "";

  if (days <= 3) {
    tone = "danger";
    label = days === 0
      ? t("dashboard.warmup.nothingYet")
      : t("dashboard.warmup.fewDaysCritical", { n: days, unit: plural(days, "unit.days") });
    detail = t("dashboard.warmup.detailCritical");
  } else {
    tone = "warn";
    label = t("dashboard.warmup.fewDaysWarn", { n: days, unit: plural(days, "unit.days") });
    detail = t("dashboard.warmup.detailWarn");
  }

  const classes = {
    danger: "border-rose/30 bg-rose/5",
    warn:   "border-orange/30 bg-orange/5",
  }[tone];
  const dotClasses = {
    danger: "bg-rose",
    warn:   "bg-orange",
  }[tone];
  const labelClasses = {
    danger: "text-rose",
    warn:   "text-orange",
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
          {t("dashboard.viewMore")}
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
    low_stock: t("dashboard.card.lowStock.label"),
    critical_stock: t("dashboard.alertKind.criticalStock"),
    dead_inventory: t("dashboard.card.dead.label"),
    repeated_stockout: t("dashboard.alertKind.repeatedStockout"),
    underestimated_sku: t("dashboard.alertKind.underestimatedSku"),
  }[kind] ?? kind;
}
