import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { SkuAnalysisChart, type ChartPoint } from "./SkuAnalysisChart";
import { ReorderPanel } from "./ReorderPanel";
import { UnitEconomics } from "./UnitEconomics";
import { TagsEditor } from "./TagsEditor";
import { EventsEditor, type EventItem } from "./EventsEditor";
import { getHolidayEventsInRange } from "@/lib/holidays";
import { HealthKpi } from "./HealthTooltip";
import { buildHealthBreakdown, buildConfidenceBreakdown } from "./health-breakdown";
import BackToSkus from "./BackToSkus";
import { InfoTooltip } from "../../../_components/InfoTooltip";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function SkuDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // user_notes нужен ReorderPanel: кнопка «Сохранить в Заметки» дописывает
  // сводку расчёта к существующим заметкам, не затирая их (Александр 04.06.2026).
  const { data: product } = await supabase
    .from("products")
    .select("product_id,sku,product_name,seller_id,lead_time_days,safety_days,user_notes,tags,cost_price,connection_id")
    .eq("product_id", id).eq("seller_id", user.id).maybeSingle();
  if (!product) notFound();

  // Александр 01.06.2026: карточка SKU иногда таймаутила (statement timeout
  // в логах postgres) — было 6 запросов подряд через await. Под нагрузкой
  // recalc-джобы суммарное время превышало 8с лимит. Решение:
  // 1) Распараллеливаем 5 независимых запросов через Promise.all.
  // 2) `select *` на tvelo_metrics → конкретные поля (нужно 11 из 25+).
  const day60Ago = new Date(Date.now() - 60 * 86400_000).toISOString();
  const day30Ago = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

  const [
    sellerRes,
    snapshotsRes,
    metricsRes,
    elasticityRes,
    changelogRes,
  ] = await Promise.all([
    supabase
      .from("sellers")
      .select("default_lead_time_days,default_safety_days,tax_rate")
      .eq("id", user.id)
      .single(),
    supabase
      .from("inventory_snapshots")
      .select("snapshot_time,stock_quantity,price,availability,seller_price,marketing_price,commission_pct")
      .eq("product_id", id)
      .gte("snapshot_time", day60Ago)
      .order("snapshot_time"),
    // Поля выбраны под потребности UI: KPI блока + buildHealthBreakdown +
    // buildConfidenceBreakdown + цикл в byDay (period_end, adjusted_velocity).
    supabase
      .from("tvelo_metrics")
      .select("period_end,adjusted_velocity,confidence_score,coverage_days,current_price,current_stock,median_30d_velocity,sku_health_score,stockout_days,in_stock_days,confidence_breakdown")
      .eq("product_id", id)
      .order("period_end", { ascending: false })
      .limit(30),
    supabase
      .from("price_elasticity")
      .select("change_date,previous_price,new_price,price_delta_pct,velocity_before,velocity_after,price_impact_percent,days_before,days_after")
      .eq("product_id", id)
      .order("change_date", { ascending: false })
      .limit(10),
    // "фиксация всех event_type кроме sales_like". sales_like — обычные
    // продажи которые засоряют список. Отфильтровываем на уровне запроса.
    supabase
      .from("changelog")
      .select("event_date,event_type,delta_stock,message,confidence_impact")
      .eq("product_id", id)
      .neq("event_type", "sales_like")
      .gte("event_date", day30Ago)
      .order("event_date", { ascending: false })
      .limit(60),
  ]);

  const seller = sellerRes.data;
  const snapshots = snapshotsRes.data;
  const metrics = metricsRes.data;
  const elasticity = elasticityRes.data;
  const changelog = changelogRes.data;

  const leadTime = product.lead_time_days ?? seller?.default_lead_time_days ?? 14;
  const safety = product.safety_days ?? seller?.default_safety_days ?? 7;

  const latest = metrics?.[0];

  const byDay = new Map<string, ChartPoint>();
  for (const s of snapshots ?? []) {
    const day = new Date(s.snapshot_time).toISOString().slice(0, 10);
    const inStock = s.availability ? 1 : 0;
    byDay.set(day, {
      date: day,
      stock: s.stock_quantity,
      price: Number(s.price),
      availability: inStock,
      // В дни нулевого наличия скорость продаж не определена (продавать нечего) —
      // оставляем null, чтобы линия TVelo прерывалась, а не тянулась сквозь сток-аут.
      velocity: inStock ? 0 : null,
      sellerPrice: (s as any).seller_price != null ? Number((s as any).seller_price) : null,
      marketingPrice: (s as any).marketing_price != null ? Number((s as any).marketing_price) : null,
    });
  }
  for (const m of metrics ?? []) {
    const day = m.period_end as string;
    const pt = byDay.get(day);
    // adjusted_velocity накладываем только на дни с наличием — в OOS-дни (velocity=null) нет.
    if (pt && pt.availability === 1) pt.velocity = Number(m.adjusted_velocity);
  }
  const chartData = Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));

  const changelogByDate: Record<string, any[]> = {};
  for (const e of (changelog ?? [])) {
    const day = (e as any).event_date as string;
    if (!changelogByDate[day]) changelogByDate[day] = [];
    changelogByDate[day].push(e);
  }

  // Календарь событий: события товара + общие события склада (product_id IS NULL
  // по connection_id товара) + виртуальные праздники на окно графика..+3 мес.
  const evFrom = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
  const evTo = new Date(Date.now() + 100 * 86400_000).toISOString().slice(0, 10);
  const { data: eventRows } = await supabase
    .from("product_events")
    .select("id,title,start_date,end_date,comment,product_id")
    .eq("seller_id", user.id)
    .or(`product_id.eq.${product.product_id},and(product_id.is.null,connection_id.eq.${(product as any).connection_id})`)
    .order("start_date", { ascending: true });
  const userEvents: EventItem[] = (eventRows ?? []).map((e: any) => ({
    id: e.id as string,
    title: e.title as string,
    startDate: e.start_date as string,
    endDate: (e.end_date as string | null) ?? null,
    comment: (e.comment as string | null) ?? null,
    source: "user" as const,
  }));
  const holidayEvents: EventItem[] = getHolidayEventsInRange(evFrom, evTo).map((h) => ({
    id: h.id,
    title: h.title,
    startDate: h.startDate,
    endDate: h.endDate,
    comment: h.comment,
    source: "holiday" as const,
  }));

  // Александр 04.06.2026: дни «нет данных» не показываем в списке событий —
  // они забивали блок (13 из 14 строк). В тултипе графика журнал остаётся полным.
  const visibleEvents = (changelog ?? []).filter((e: any) => e.event_type !== "missing_data");

  let adjVsMedian = "";
  if (latest && latest.median_30d_velocity != null) {
    const adj = Number(latest.adjusted_velocity);
    const med = Number(latest.median_30d_velocity);
    if (med > 0 && adj > 0) {
      const diffPct = ((adj - med) / med) * 100;
      const sign = diffPct >= 0 ? "+" : "";
      adjVsMedian = t("sku.detail.fromMedian", { pct: `${sign}${diffPct.toFixed(0)}` });
    }
  }

  // Computed KPI по правкам Александра 01.06.2026:
  // Упущенная выручка = TVelo × stockout_days × price
  // Рекомендуемая закупка на 30 дней = TVelo × 30
  const tvelo = latest ? Number(latest.adjusted_velocity ?? 0) : 0;
  const stockoutDays = latest ? Number(latest.stockout_days ?? 0) : 0;
  const price = latest ? Number(latest.current_price ?? 0) : 0;
  const lostRevenue = tvelo * stockoutDays * price;
  const lostUnits = Math.round(tvelo * stockoutDays);
  const recommendedReorder30 = Math.round(tvelo * 30);

  // Юнит-экономика (#5): фактическая цена со скидками из последнего снапшота
  // (что реально платит покупатель) + комиссия МП из API как стартовый дефолт.
  const lastSnap = snapshots && snapshots.length ? snapshots[snapshots.length - 1] : null;
  const unitPrice = lastSnap ? Number((lastSnap as any).marketing_price ?? lastSnap.price ?? 0) : price;
  // Комиссия: берём самую свежую НЕпустую ставку из окна снапшотов. Ozon /v5
  // для части товаров не отдаёт sales_percent на каждом синке, поэтому последний
  // снапшот мог оказаться без неё — раньше из-за этого «комиссия из API» не
  // подгружалась, хотя ранее значение было. Скан с конца находит последнюю known.
  let unitCommission: number | null = null;
  for (let i = (snapshots?.length ?? 0) - 1; i >= 0; i--) {
    const c = (snapshots as any)[i]?.commission_pct;
    if (c != null) { unitCommission = Number(c); break; }
  }

  return (
    <div className="space-y-6">
      <header>
        <BackToSkus label={t("sku.detail.allSku")} />
        <div className="mt-3 flex items-baseline gap-2 sm:gap-3 flex-wrap">
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl tracking-tight font-medium text-ink break-words">{product.product_name}</h1>
        </div>
        <div className="mt-1 font-mono text-xs text-ink-hush uppercase tracking-wider">
          SKU: <span className="text-ink-soft normal-case">{product.sku}</span>
        </div>
        <TagsEditor productId={product.product_id} initial={product.tags ?? null} />
        <EventsEditor
          productId={product.product_id}
          connectionId={(product as any).connection_id}
          initial={userEvents}
          holidays={holidayEvents}
        />
      </header>

      {/* Верхний блок KPI — переработан 01.06.2026 по ТЗ Александра.
          Поля: Health Score, TVelo (3 мес), Покрытие, Достоверность,
          Дней без наличия (1 мес), Упущенная выручка, Рекомендуемая закупка 30д. */}
      {latest && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
          <HealthKpi
            label={t("sku.detail.kpi.health")}
            value={`${Number(latest.sku_health_score ?? 0).toFixed(0)}/100`}
            breakdown={buildHealthBreakdown(latest)}
            accent="violet"
          />
          <Kpi
            label={t("sku.detail.kpi.tvelo")}
            value={tvelo.toFixed(2)}
            sub={adjVsMedian || t("sku.detail.unit.perDay")}
          />
          <Kpi
            label={t("sku.detail.kpi.coverage")}
            value={latest.coverage_days != null ? t("sku.daysShort", { n: Number(latest.coverage_days).toFixed(0) }) : "—"}
            sub={t("sku.detail.kpi.coverageSub")}
          />
          <HealthKpi
            label={t("sku.detail.kpi.confidence")}
            value={`${Number(latest.confidence_score ?? 0).toFixed(0)}%`}
            breakdown={buildConfidenceBreakdown(latest)}
            accent="blue"
          />
          <Kpi
            label={t("sku.detail.kpi.oos")}
            value={stockoutDays > 0 ? `${stockoutDays}` : "0"}
            sub={t("sku.detail.kpi.oosSub")}
            tone={stockoutDays > 0 ? "warn" : undefined}
          />
          <Kpi
            label={t("sku.detail.kpi.lost")}
            value={lostRevenue > 0 ? Math.round(lostRevenue).toLocaleString("ru-RU") : "0"}
            sub={lostRevenue > 0 ? t("sku.detail.kpi.lostSub", { units: lostUnits }) : t("sku.detail.kpi.lostNone")}
            tone={lostRevenue > 0 ? "danger" : undefined}
          />
          <Kpi
            label={t("sku.detail.kpi.reorder")}
            value={recommendedReorder30 > 0 ? recommendedReorder30.toLocaleString("ru-RU") : "—"}
            sub={t("sku.detail.kpi.reorderSub")}
            tone={recommendedReorder30 > 0 ? "accent" : undefined}
          />
          <Kpi
            label={t("sku.detail.kpi.stock")}
            value={latest.current_stock != null ? Number(latest.current_stock).toLocaleString("ru-RU") : "—"}
            sub={price > 0 ? t("sku.detail.kpi.stockSub", { price: price.toLocaleString("ru-RU") }) : undefined}
          />
        </div>
      )}

      {/* Основной график — TVelo (зелёная), Цена (фиолетовая), Остаток/OOS по нижней
          секции на скрытых шкалах (Александр 04.06.2026, см. SkuAnalysisChart). */}
      <div className="rounded-2xl border border-line bg-paper p-4 sm:p-6">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold mb-4">{t("sku.detail.analysis")}</h2>
        {chartData.length < 2 ? (
          <p className="text-sm text-ink-muted">{t("sku.detail.chartEmpty")}</p>
        ) : (
          <SkuAnalysisChart data={chartData} changelogByDate={changelogByDate} events={[...holidayEvents, ...userEvents]} />
        )}
      </div>

      {latest && (
        <ReorderPanel
          productId={product.product_id}
          adjustedVelocity={Number(latest.adjusted_velocity)}
          currentStock={Number(latest.current_stock)}
          leadTimeDays={leadTime}
          safetyDays={safety}
          initialNotes={product.user_notes ?? null}
        />
      )}

      {unitPrice > 0 && (
        <UnitEconomics priceRub={unitPrice} commissionPct={unitCommission} costRub={(product as any).cost_price != null ? Number((product as any).cost_price) : null} taxRate={(seller as any)?.tax_rate != null ? Number((seller as any).tax_rate) : null} productId={id} />
      )}

      {(elasticity ?? []).length > 0 && (
        <div className="rounded-2xl border border-line bg-paper p-4 sm:p-6">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold">{t("sku.detail.elasticity.title")}</h2>
          <h3 className="font-display text-base sm:text-lg font-medium text-ink mt-1">{t("sku.detail.elasticity.h")}</h3>
          <p className="text-sm text-ink-muted mb-4">{t("sku.detail.elasticity.sub")}</p>
          <div className="grid gap-3">
            {(elasticity ?? []).map((e: any, i: number) => {
              const impact = Number(e.price_impact_percent);
              const positiveImpact = impact > 0;
              return (
                <div key={i} className="flex items-center gap-3 sm:gap-4 md:gap-6 p-3 sm:p-4 rounded-xl border border-line bg-bg-soft flex-wrap">
                  <div className="font-mono text-xs text-ink-hush whitespace-nowrap">
                    {new Date(e.change_date).toLocaleDateString("ru-RU")}
                  </div>
                  <div className="text-sm">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">{t("sku.detail.priceColon")}</span>{" "}
                    <span className="font-mono text-ink-soft">{Number(e.previous_price).toFixed(2)}</span>
                    {" → "}
                    <span className="font-mono font-semibold text-ink">{Number(e.new_price).toFixed(2)}</span>
                    <span className={`ml-2 font-mono text-xs font-semibold ${Number(e.price_delta_pct) > 0 ? "text-orange" : "text-lime-deep"}`}>
                      ({Number(e.price_delta_pct) > 0 ? "+" : ""}{Number(e.price_delta_pct).toFixed(1)}%)
                    </span>
                  </div>
                  <div className="text-sm flex-1 min-w-[180px]">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">{t("sku.detail.velocityColon")}</span>{" "}
                    <span className="font-mono text-ink-soft">{Number(e.velocity_before).toFixed(2)}</span>
                    {" → "}
                    <span className="font-mono font-semibold text-ink">{Number(e.velocity_after).toFixed(2)}</span>
                  </div>
                  <div className={`px-3 py-1.5 rounded-lg font-mono text-sm font-semibold whitespace-nowrap ${
                    positiveImpact ? "bg-lime-soft text-lime-deep border border-lime-deep/30" : "bg-rose/10 text-rose border border-rose/30"
                  }`}>
                    {positiveImpact ? "+" : ""}{impact.toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* "Последние события" — фиксация всех event_type кроме sales_like.
          Включает изменения цены (отображаются как replenishment_like с price diff)
          и аномалии. sales_like засорял список.
          Александр 04.06.2026: блок вдвое компактнее, дни «нет данных» скрыты. */}
      <div className="rounded-2xl border border-line bg-paper p-4 sm:p-6">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold">{t("sku.detail.events.title")}</h2>
        <h3 className="font-display text-base font-medium text-ink mt-1 mb-3">
          {t("sku.detail.events.h")}
          <InfoTooltip text={t("sku.detail.events.hint")} />
        </h3>
        {visibleEvents.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("sku.detail.events.empty")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {visibleEvents.map((e: any, i: number) => (
              <li key={i} className="py-1 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs">
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  <span className="text-ink-hush text-[11px] whitespace-nowrap sm:w-20 font-mono">
                    {new Date(e.event_date).toLocaleDateString("ru-RU")}
                  </span>
                  <span className={`inline-flex items-center justify-center font-mono text-[9px] uppercase tracking-widest px-1.5 py-px rounded border font-semibold sm:w-28 whitespace-nowrap ${TYPE_STYLES[e.event_type] ?? "text-ink-soft bg-bg-soft border-line"}`}>
                    {TYPE_LABELS[e.event_type] ?? e.event_type}
                  </span>
                </div>
                <span className="text-ink-soft flex-1 break-words">{e.message}</span>
                {e.confidence_impact != null && Number(e.confidence_impact) !== 0 && (
                  <span className="font-mono text-[11px] text-orange whitespace-nowrap shrink-0">−{Math.abs(Number(e.confidence_impact)).toFixed(1)}%</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const TYPE_LABELS: Record<string, string> = {
  first_snapshot: t("sku.eventType.first"),
  replenishment_like: t("sku.eventType.replenishment"),
  anomaly_like: t("sku.eventType.anomaly"),
  missing_data: t("sku.eventType.missing"),
  recount_like: t("sku.eventType.recount"),
  price_change: t("sku.eventType.priceChange"),
};

const TYPE_STYLES: Record<string, string> = {
  first_snapshot:     "text-ink-soft bg-bg-soft border-line",
  replenishment_like: "text-azure bg-azure/10 border-azure/30",
  anomaly_like:       "text-orange bg-orange/10 border-orange/30",
  missing_data:       "text-ink-soft bg-bg-soft border-line",
  recount_like:       "text-azure bg-azure/10 border-azure/30",
  price_change:       "text-rose bg-rose/10 border-rose/30",
};

function Kpi({ label, value, sub, tone }: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "warn" | "danger" | "accent";
}) {
  const valueColor =
    tone === "warn"   ? "text-orange" :
    tone === "danger" ? "text-rose" :
    tone === "accent" ? "text-lime-deep" :
                        "text-ink";
  return (
    <div className="rounded-xl border border-line bg-paper p-3 sm:p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hush">{label}</div>
      <div className={`mt-1 font-display text-lg sm:text-xl md:text-2xl tabular font-medium break-words ${valueColor}`}>{value}</div>
      {sub && <div className="text-xs text-ink-hush mt-0.5 font-mono truncate">{sub}</div>}
    </div>
  );
}
