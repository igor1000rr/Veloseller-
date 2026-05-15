"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, ComposedChart, Bar } from "recharts";

type HistoryPoint = {
  period_end: string;
  warehouse_health_score: number | null;
  lost_revenue: number | null;
  total_inventory_value: number | null;
};

type SegmentRow = { name: string; value: number };

const SEGMENT_COLORS: Record<string, string> = {
  fast_movers: "#0d9488",
  stable: "#2563eb",
  slow_movers: "#f59e0b",
  dead_inventory_risk: "#7c7c7c",
  insufficient_data: "#cbd5e1",
};

const SEGMENT_LABELS: Record<string, string> = {
  fast_movers: "Быстрые",
  stable: "Стабильные",
  slow_movers: "Медленные",
  dead_inventory_risk: "Неликвид",
  insufficient_data: "Мало данных",
};

export function HealthTrend({ history }: { history: HistoryPoint[] }) {
  const data = history.slice().reverse().map(p => ({
    date: new Date(p.period_end).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
    score: p.warehouse_health_score,
  }));

  if (data.length < 2) {
    return <p className="text-sm text-slate-500">Накапливается история — графики появятся через 2+ дня</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
        <YAxis domain={[0, 100]} stroke="#64748b" fontSize={12} />
        <Tooltip />
        <Line type="monotone" dataKey="score" stroke="#0f766e" strokeWidth={2} dot={{ r: 3 }} name="Health" />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function LostRevenueTrend({ history }: { history: HistoryPoint[] }) {
  const data = history.slice().reverse().map(p => ({
    date: new Date(p.period_end).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
    lost: p.lost_revenue ?? 0,
  }));

  if (data.length < 2) {
    return <p className="text-sm text-slate-500">Накапливается история — графики появятся через 2+ дня</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
        <YAxis stroke="#64748b" fontSize={12} />
        <Tooltip />
        <Line type="monotone" dataKey="lost" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} name="Lost revenue" />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SegmentPie({ distribution }: { distribution: Record<string, number> | null }) {
  if (!distribution || Object.keys(distribution).length === 0) {
    return <p className="text-sm text-slate-500">Нет данных по сегментам</p>;
  }
  const data: SegmentRow[] = Object.entries(distribution).map(([name, value]) => ({ name, value }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          cx="50%" cy="50%"
          innerRadius={45} outerRadius={75}
          paddingAngle={2}
          dataKey="value"
          nameKey="name"
        >
          {data.map((entry, idx) => (
            <Cell key={idx} fill={SEGMENT_COLORS[entry.name] ?? "#cbd5e1"} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number, _n, props: any) => [v, SEGMENT_LABELS[props.payload.name] ?? props.payload.name]} />
        <Legend formatter={(value) => SEGMENT_LABELS[value as string] ?? value} />
      </PieChart>
    </ResponsiveContainer>
  );
}


export function DeadInventoryChart({ history }: { history: any[] }) {
  const data = history.slice().reverse().map(p => ({
    date: new Date(p.period_end).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
    skus: p.dead_inventory_sku_count ?? 0,
    money: Number(p.store_frozen_inventory_value ?? 0),
  }));
  if (data.length < 2) return <p className="text-sm text-slate-500">Накапливается история — график появится через 2+ дня</p>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
        <YAxis yAxisId="skus" stroke="#7c7c7c" fontSize={12} />
        <YAxis yAxisId="money" orientation="right" stroke="#dc2626" fontSize={12} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="skus" dataKey="skus" fill="#94a3b8" name="SKU неликвида" radius={[4,4,0,0]} />
        <Line yAxisId="money" type="monotone" dataKey="money" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} name="Заморожено, ₽" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
