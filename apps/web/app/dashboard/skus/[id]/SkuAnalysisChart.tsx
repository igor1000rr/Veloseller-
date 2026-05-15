"use client";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ReferenceDot, ReferenceLine, Area,
} from "recharts";

export type ChartPoint = {
  date: string;
  stock: number;
  price: number;
  availability: number;     // 0 или 1
  velocity: number;
};

export type ChangelogByDate = Record<string, Array<{
  event_type: string;
  delta_stock: number | null;
  message: string;
  confidence_impact: number | null;
}>>;

const TYPE_LABELS: Record<string, string> = {
  first_snapshot: "Старт",
  sales_like: "Продажа",
  replenishment_like: "Пополнение",
  anomaly_like: "Аномалия",
  missing_data: "Нет данных",
  recount_like: "Recount",
};

export function SkuAnalysisChart({ data, changelogByDate }: { data: ChartPoint[]; changelogByDate?: ChangelogByDate }) {
  // Rule 12.1 — детектим изменения цены и считаем %-дельту
  const priceChanges: { date: string; dateLabel: string; price: number; prev: number; pct: number }[] = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i].price !== data[i - 1].price && data[i].price > 0 && data[i - 1].price > 0) {
      const prev = data[i - 1].price;
      const next = data[i].price;
      priceChanges.push({
        date: data[i].date,
        dateLabel: new Date(data[i].date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
        price: next,
        prev,
        pct: ((next - prev) / prev) * 100,
      });
    }
  }

  const formatted = data.map(d => ({
    ...d,
    dateLabel: new Date(d.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
  }));

  // Custom tooltip — под warm-paper палитру + changelog раскрытие
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const p = payload[0].payload;
    const isoDate = p.date as string;
    const events = changelogByDate?.[isoDate] ?? [];
    const pc = priceChanges.find((x) => x.date === isoDate);

    return (
      <div className="bg-paper border border-line rounded-lg p-3 shadow-md text-sm max-w-sm">
        <div className="font-display font-medium text-ink mb-2">{p.dateLabel}</div>
        <div className="space-y-1 font-mono text-xs">
          <Row label="TVelo" value={Number(p.velocity).toFixed(2)} color="#3f6212" />
          <Row label="Цена" value={Number(p.price).toFixed(2)} color="#7c3aed" />
          <Row label="Остаток" value={String(p.stock)} />
          <Row label="Доступность" value={p.availability ? "в наличии" : "OOS"} color={p.availability ? "#3f6212" : "#e11d48"} />
        </div>
        {pc && (
          <div className="mt-3 pt-2 border-t border-line">
            <div className="font-mono text-[10px] uppercase tracking-widest text-violet-700 font-semibold mb-1">изменение цены</div>
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
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-1">журнал</div>
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
    <ResponsiveContainer width="100%" height={420}>
      <ComposedChart data={formatted} margin={{ top: 24, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e6e3d4" vertical={false} />
        <XAxis dataKey="dateLabel" stroke="#8a8a7e" fontSize={11} tickLine={false} />
        <YAxis yAxisId="velocity" stroke="#3f6212" fontSize={11} tickLine={false}
               label={{ value: "TVelo / Остаток", angle: -90, position: "insideLeft", fill: "#3f6212", fontSize: 11 }} />
        <YAxis yAxisId="price" orientation="right" stroke="#7c3aed" fontSize={11} tickLine={false}
               label={{ value: "Цена", angle: 90, position: "insideRight", fill: "#7c3aed", fontSize: 11 }} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />

        {/* OOS-полосы (availability=0) */}
        <Area yAxisId="velocity" type="step" dataKey={(d: any) => d.availability === 0 ? 100 : 0}
              fill="#fecaca" stroke="none" name="Out of stock" isAnimationActive={false} />

        {/* Остаток — бары */}
        <Bar yAxisId="velocity" dataKey="stock" fill="#a5ada3" name="Остаток" opacity={0.55} />

        {/* TVelo (Rule 5.3) */}
        <Line yAxisId="velocity" type="monotone" dataKey="velocity" stroke="#3f6212"
              strokeWidth={2.5} dot={{ r: 3, fill: "#3f6212", stroke: "#fff", strokeWidth: 1.5 }} name="TVelo" />

        {/* Цена (Rule 12.2 — точки изменения) */}
        <Line yAxisId="price" type="monotone" dataKey="price" stroke="#7c3aed"
              strokeWidth={2} strokeDasharray="4 4" dot={false} name="Цена" />

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
