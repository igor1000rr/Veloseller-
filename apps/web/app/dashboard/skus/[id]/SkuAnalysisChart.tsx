"use client";
import { useMemo, useState } from "react";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ReferenceDot, ReferenceLine, Area,
} from "recharts";
import { t } from "@/lib/i18n";
import { LOCALE } from "@/lib/features";

const isEn = LOCALE === "en";

// Правка 10 (#3): две линии цены — цена продавца и факт. цена со скидками МП.
const L = {
  sellerPrice: isEn ? "Your price" : "Ваша цена",
  marketingPrice: isEn ? "Price w/ discounts" : "Цена со скидками",
};

// Правка 10 (#4): переключатель деления графика 1d/7d/1m. Дневные точки
// ресемплятся в недельные/месячные бакеты: velocity — среднее за период,
// price/stock — значение на конец периода, availability — мажоритарно (для OOS-полос).
// Журнал изменений мёржится по всем дням бакета под его конечную дату.
type ChartPeriod = "1d" | "7d" | "1m";

const PERIOD_LABELS: Record<ChartPeriod, string> = isEn
  ? { "1d": "1d", "7d": "7d", "1m": "1m" }
  : { "1d": "1д", "7d": "7д", "1m": "1мес" };

function chartLabel(dateStr: string, period: ChartPeriod): string {
  const d = new Date(dateStr);
  const loc = isEn ? "en-US" : "ru-RU";
  if (period === "1m") return d.toLocaleDateString(loc, { month: "short", year: "2-digit" });
  return d.toLocaleDateString(loc, { day: "2-digit", month: "2-digit" });
}

function resampleChart(
  data: ChartPoint[],
  changelog: ChangelogByDate | undefined,
  period: ChartPeriod,
): { points: ChartPoint[]; changelog: ChangelogByDate } {
  if (period === "1d" || data.length === 0) {
    return { points: data, changelog: changelog ?? {} };
  }
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const keyOf = (ds: string): string => {
    const d = new Date(ds);
    if (period === "1m") return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const dayIdx = Math.floor(d.getTime() / 86400000);
    return String(Math.floor(dayIdx / 7));
  };
  const groups = new Map<string, ChartPoint[]>();
  for (const pt of sorted) {
    const k = keyOf(pt.date);
    const arr = groups.get(k);
    if (arr) arr.push(pt);
    else groups.set(k, [pt]);
  }
  const points: ChartPoint[] = [];
  const merged: ChangelogByDate = {};
  for (const arr of groups.values()) {
    const last = arr[arr.length - 1];
    // velocity: среднее только по дням с наличием (velocity != null). Если все дни
    // бакета были OOS — null, чтобы линия скорости прервалась, а не падала в 0.
    const velVals = arr.map((p) => p.velocity).filter((v): v is number => v != null && !Number.isNaN(v));
    const velAvg = velVals.length ? velVals.reduce((s, v) => s + v, 0) / velVals.length : null;
    const availMean = arr.reduce((s, p) => s + (p.availability ? 1 : 0), 0) / arr.length;
    points.push({
      date: last.date,
      stock: last.stock,
      price: last.price,
      availability: availMean >= 0.5 ? 1 : 0,
      velocity: velAvg,
      sellerPrice: last.sellerPrice ?? null,
      marketingPrice: last.marketingPrice ?? null,
    });
    if (changelog) {
      const evs: ChangelogByDate[string] = [];
      for (const p of arr) {
        const e = changelog[p.date];
        if (e && e.length) evs.push(...e);
      }
      if (evs.length) merged[last.date] = evs;
    }
  }
  return { points, changelog: merged };
}

export type ChartPoint = {
  date: string;
  stock: number;
  price: number;
  availability: number;     // 0 или 1
  velocity: number | null;  // null = нулевое наличие: в OOS-дни скорость не считаем
  sellerPrice?: number | null;     // цена продавца (#3)
  marketingPrice?: number | null;  // факт. цена со скидками МП (#3)
};

export type ChangelogByDate = Record<string, Array<{
  event_type: string;
  delta_stock: number | null;
  message: string;
  confidence_impact: number | null;
}>>;

const TYPE_LABELS: Record<string, string> = {
  first_snapshot: t("sku.eventType.first"),
  sales_like: t("sku.eventType.sale"),
  replenishment_like: t("sku.eventType.replenishment"),
  anomaly_like: t("sku.eventType.anomaly"),
  missing_data: t("sku.eventType.missing"),
  recount_like: t("sku.eventType.recount"),
};

// Александр 04.06.2026: остаток отвязан от левой шкалы (там только TVelo).
// Остаток и OOS-полосы рисуются «по нижней секции» — на скрытых осях, домен
// которых растянут так, что максимум занимает STOCK_BAND высоты графика.
// Иначе при остатках в сотни штук линия TVelo (0–3) лежала на дне.
const STOCK_BAND = 0.28;

export function SkuAnalysisChart({ data, changelogByDate, events }: { data: ChartPoint[]; changelogByDate?: ChangelogByDate; events?: SkuChartEvent[] }) {
  const calEvents = events ?? [];
  const [period, setPeriod] = useState<ChartPeriod>("1d");
  const { points, changelog: cl } = useMemo(
    () => resampleChart(data, changelogByDate, period),
    [data, changelogByDate, period],
  );

  // Rule 12.1 — детектим изменения цены и считаем %-дельту (по точкам выбранного периода)
  const priceChanges: { date: string; dateLabel: string; price: number; prev: number; pct: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    if (points[i].price !== points[i - 1].price && points[i].price > 0 && points[i - 1].price > 0) {
      const prev = points[i - 1].price;
      const next = points[i].price;
      priceChanges.push({
        date: points[i].date,
        dateLabel: chartLabel(points[i].date, period),
        price: next,
        prev,
        pct: ((next - prev) / prev) * 100,
      });
    }
  }

  const formatted = points.map(d => ({
    ...d,
    dateLabel: chartLabel(d.date, period),
  }));

  // Custom tooltip — под warm-paper палитру + changelog раскрытие
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const p = payload[0].payload;
    const isoDate = p.date as string;
    const events = cl?.[isoDate] ?? [];
    const pc = priceChanges.find((x) => x.date === isoDate);

    return (
      <div className="bg-paper border border-line rounded-lg p-3 shadow-md text-sm max-w-sm">
        <div className="font-display font-medium text-ink mb-2">{p.dateLabel}</div>
        <div className="space-y-1 font-mono text-xs">
          <Row label="TVelo" value={p.velocity != null ? Number(p.velocity).toFixed(2) : "—"} color="#3f6212" />
          {p.sellerPrice != null && p.marketingPrice != null && Math.abs(Number(p.sellerPrice) - Number(p.marketingPrice)) >= 0.01 ? (
            <>
              <Row label={L.sellerPrice} value={Number(p.sellerPrice).toFixed(2)} color="#d97706" />
              <Row label={L.marketingPrice} value={Number(p.marketingPrice).toFixed(2)} color="#7c3aed" />
            </>
          ) : (
            <Row label={t("sku.chart.price")} value={Number(p.price).toFixed(2)} color="#7c3aed" />
          )}
          <Row label={t("sku.chart.stock")} value={String(p.stock)} />
          <Row label={t("sku.chart.availability")} value={p.availability ? t("sku.chart.inStock") : "OOS"} color={p.availability ? "#3f6212" : "#e11d48"} />
        </div>
        {pc && (
          <div className="mt-3 pt-2 border-t border-line">
            <div className="font-mono text-[10px] uppercase tracking-widest text-violet-700 font-semibold mb-1">{t("sku.chart.priceChange")}</div>
            <div className="text-xs text-ink-soft font-mono">
              {pc.prev.toFixed(2)} → {pc.price.toFixed(2)}{" "}
              <span className={pc.pct > 0 ? "text-orange font-semibold" : "text-lime-deep font-semibold"}>
                ({pc.pct > 0 ? "+" : ""}{pc.pct.toFixed(1)}%)
              </span>
            </div>
          </div>
        )}
        {events.length > 0 && (
          <div className="mt-3 pt-2 border-t border-line">
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-1">{t("sku.chart.journal")}</div>
            {events.map((e, i) => (
              <div key={i} className="text-xs text-ink-muted mb-1 leading-snug">
                <span className="inline-block font-mono px-1.5 py-0.5 rounded bg-bg-soft border border-line text-[10px] text-ink-soft uppercase tracking-wider mr-1.5">
                  {TYPE_LABELS[e.event_type] ?? e.event_type}
                </span>
                <span>{e.message}</span>
                {e.confidence_impact != null && Number(e.confidence_impact) !== 0 && (
                  <span className="text-orange ml-1 font-mono">(−{Math.abs(Number(e.confidence_impact)).toFixed(1)}%)</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="flex justify-end mb-2">
        <div className="flex gap-1 rounded-lg border border-line bg-bg-soft p-0.5 font-mono text-[10px] uppercase tracking-wider">
          {(["1d", "7d", "1m"] as ChartPeriod[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 rounded transition ${
                period === p ? "bg-paper text-ink font-semibold shadow-sm" : "text-ink-hush hover:text-ink"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={420}>
      <ComposedChart data={formatted} margin={{ top: 24, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e6e3d4" vertical={false} />
        <XAxis dataKey="dateLabel" stroke="#8a8a7e" fontSize={11} tickLine={false} />
        {/* Левая шкала — только TVelo (Александр 04.06.2026). */}
        <YAxis yAxisId="velocity" stroke="#3f6212" fontSize={11} tickLine={false} domain={[0, "auto"]}
               label={{ value: t("sku.chart.axisLeft"), angle: -90, position: "insideLeft", fill: "#3f6212", fontSize: 11 }} />
        <YAxis yAxisId="price" orientation="right" stroke="#7c3aed" fontSize={11} tickLine={false}
               label={{ value: t("sku.chart.price"), angle: 90, position: "insideRight", fill: "#7c3aed", fontSize: 11 }} />
        {/* Скрытая шкала остатков: домен растянут так, что максимальный бар
            занимает STOCK_BAND высоты — остатки «по нижней секции». */}
        <YAxis yAxisId="stock" hide domain={[0, (dataMax: number) => Math.max(dataMax, 1) / STOCK_BAND]} />
        {/* Скрытая шкала OOS-полос (0..1): полоса высотой STOCK_BAND снизу. */}
        <YAxis yAxisId="band" hide domain={[0, 1]} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />

        {/* OOS-полосы (availability=0) — по нижней секции, вровень с остатками */}
        <Area yAxisId="band" type="step" dataKey={(d: any) => d.availability === 0 ? STOCK_BAND : 0}
              fill="#fecaca" stroke="none" name={t("sku.chart.oosLegend")} isAnimationActive={false} />

        {/* Остаток — бары по нижней секции (своя скрытая шкала) */}
        <Bar yAxisId="stock" dataKey="stock" fill="#a5ada3" name={t("sku.chart.stock")} opacity={0.55} />

        {/* TVelo (Rule 5.3) */}
        <Line yAxisId="velocity" type="monotone" dataKey="velocity" stroke="#3f6212"
              strokeWidth={2.5} dot={{ r: 3, fill: "#3f6212", stroke: "#fff", strokeWidth: 1.5 }} name="TVelo" />

        {/* Цена со скидками (факт.) — фиолетовая пунктирная (как раньше выглядела линия цены),
            фолбэк на price для исторических точек до появления раздельных полей (#3) */}
        <Line yAxisId="price" type="monotone" dataKey={(d: any) => d.marketingPrice ?? d.price} stroke="#7c3aed"
              strokeWidth={2} strokeDasharray="4 4" dot={false} name={L.marketingPrice} connectNulls />
        {/* Ваша цена (номинал, что ставит продавец) — янтарная сплошная.
            Расхождение с фиолетовой = манипуляция маркетплейса скидками (#3) */}
        <Line yAxisId="price" type="monotone" dataKey={(d: any) => d.sellerPrice ?? d.price} stroke="#d97706"
              strokeWidth={1.5} dot={false} name={L.sellerPrice} connectNulls />

        {/* Rule 12.2 — vertical markers на каждое изменение цены */}
        {priceChanges.map((pc, i) => (
          <ReferenceLine
            key={`line-${i}`}
            yAxisId="velocity"
            x={pc.dateLabel}
            stroke="#7c3aed"
            strokeDasharray="2 4"
            strokeWidth={1.2}
            label={{
              value: `${pc.pct > 0 ? "+" : ""}${pc.pct.toFixed(0)}%`,
              position: "top",
              fill: pc.pct > 0 ? "#ea580c" : "#3f6212",
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
            }}
          />
        ))}

        {/* Rule 12.2 — выделенные точки на линии цены */}
        {priceChanges.map((pc, i) => (
          <ReferenceDot
            key={`dot-${i}`}
            yAxisId="price"
            x={pc.dateLabel}
            y={pc.price}
            r={6}
            fill="#7c3aed"
            stroke="#fff"
            strokeWidth={2}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-ink-hush">{label}:</span>
      <span className="tabular" style={color ? { color, fontWeight: 600 } : undefined}>{value}</span>
    </div>
  );
}
