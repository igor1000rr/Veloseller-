"use client";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";

export function VelocitySparkline({ points }: { points: number[] }) {
  if (points.length < 2) return <span className="text-slate-300 text-xs">—</span>;
  const data = points.map((v, i) => ({ i, v }));
  // Цвет в зависимости от тренда
  const trend = points[points.length - 1] - points[0];
  const color = trend > 0 ? "#0d9488" : trend < 0 ? "#dc2626" : "#64748b";
  return (
    <div style={{ width: 80, height: 24 }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
