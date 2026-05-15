"use client";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ReferenceDot, Area,
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
  recount_like: "Recount/Цена",
};

export function SkuAnalysisChart({ data, changelogByDate }: { data: ChartPoint[]; changelogByDate?: ChangelogByDate }) {
  // Находим даты, где цена менялась — точки на графике
  const priceChanges: { date: string; price: number }[] = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i].price !== data[i - 1].price && data[i].price > 0 && data[i - 1].price > 0) {
      priceChanges.push({ date: data[i].date, price: data[i].price });
    }
  }

  const formatted = data.map(d => ({
    ...d,
    dateLabel: new Date(d.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
  }));

  // Custom tooltip с changelog раскрытием
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const p = payload[0].payload;
    const isoDate = p.date as string;
    const events = changelogByDate?.[isoDate] ?? [];

    return (
      <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-md text-sm max-w-sm">
        <div className="font-semibold text-slate-900 mb-2">{p.dateLabel}</div>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between gap-4"><span className="text-slate-500">TVelo:</span><span className="font-mono text-teal-700">{Number(p.velocity).toFixed(2)}</span></div>
          <div className="flex justify-between gap-4"><span className="text-slate-500">Цена:</span><span className="font-mono text-violet-700">{Number(p.price).toFixed(2)}</span></div>
          <div className="flex justify-between gap-4"><span className="text-slate-500">Остаток:</span><span className="font-mono">{p.stock}</span></div>
          <div className="flex justify-between gap-4"><span className="text-slate-500">Доступность:</span><span>{p.availability ? "✓ В наличии" : "✗ Нет"}</span></div>
        </div>
        {events.length > 0 && (
          <div className="mt-3 pt-2 border-t border-slate-100">
            <div className="text-xs font-semibold text-slate-700 mb-1">Журнал событий</div>
            {events.map((e, i) => (
              <div key={i} className="text-xs text-slate-600 mb-1">
                <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 mr-1 text-[10px]">{TYPE_LABELS[e.event_type] ?? e.event_type}</span>
                <span>{e.message}</span>
                {e.confidence_impact != null && Number(e.confidence_impact) !== 0 && (
                  <span className="text-amber-700 ml-1">(conf {Number(e.confidence_impact).toFixed(1)}%)</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={400}>
      <ComposedChart data={formatted} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="dateLabel" stroke="#64748b" fontSize={11} tickLine={false} />
        <YAxis yAxisId="velocity" stroke="#0d9488" fontSize={11} tickLine={false}
               label={{ value: "TVelo / Остаток", angle: -90, position: "insideLeft", fill: "#0d9488", fontSize: 11 }} />
        <YAxis yAxisId="price" orientation="right" stroke="#7c3aed" fontSize={11} tickLine={false}
               label={{ value: "Цена", angle: 90, position: "insideRight", fill: "#7c3aed", fontSize: 11 }} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />

        <Area yAxisId="velocity" type="step" dataKey={(d: any) => d.availability === 0 ? 100 : 0}
              fill="#fecaca" stroke="none" name="Out of stock" isAnimationActive={false} />

        <Bar yAxisId="velocity" dataKey="stock" fill="#94a3b8" name="Остаток" opacity={0.5} />

        <Line yAxisId="velocity" type="monotone" dataKey="velocity" stroke="#0d9488"
              strokeWidth={2.5} dot={{ r: 3 }} name="TVelo" />

        <Line yAxisId="price" type="monotone" dataKey="price" stroke="#7c3aed"
              strokeWidth={2} strokeDasharray="4 4" dot={false} name="Цена" />

        {priceChanges.map((pc, i) => {
          const labelDate = new Date(pc.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
          return (
            <ReferenceDot key={i} yAxisId="price" x={labelDate} y={pc.price}
                          r={6} fill="#7c3aed" stroke="#fff" strokeWidth={2} />
          );
        })}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
