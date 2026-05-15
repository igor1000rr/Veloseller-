"use client";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";

const COLORS = {
  violet: "#7c3aed",
  blue: "#2563eb",
  indigo: "#4f46e5",
  sky: "#0284c7",
  slate: "#94a3b8",
  green: "#10b981",
  red: "#ef4444",
};

export function RegistrationsChart({ data }: { data: { date: string; count: number }[] }) {
  if (data.length === 0) return <Empty>Регистраций пока нет</Empty>;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="regGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.violet} stopOpacity={0.2} />
            <stop offset="100%" stopColor={COLORS.violet} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
        <Area type="monotone" dataKey="count" stroke={COLORS.violet} strokeWidth={2} fill="url(#regGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function SnapshotsChart({ data }: { data: { date: string; count: number }[] }) {
  if (data.length === 0) return <Empty>Снимков нет</Empty>;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
        <Bar dataKey="count" fill={COLORS.blue} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PlansPieChart({ data }: { data: { plan: string; count: number }[] }) {
  const palette: Record<string, string> = {
    trial: COLORS.slate, starter: COLORS.sky, growth: COLORS.blue, pro: COLORS.violet,
  };
  const filtered = data.filter(d => d.count > 0);
  if (filtered.length === 0) return <Empty>Селлеров нет</Empty>;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={filtered} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="count" nameKey="plan">
          {filtered.map((e, i) => <Cell key={i} fill={palette[e.plan] ?? COLORS.slate} />)}
        </Pie>
        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ActivityChart({ data }: { data: { date: string; snapshots: number; recalcs: number }[] }) {
  if (data.length === 0) return <Empty>Активности нет</Empty>;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
        <Line type="monotone" dataKey="snapshots" stroke={COLORS.blue} strokeWidth={2} dot={{ r: 2 }} name="Snapshots" />
        <Line type="monotone" dataKey="recalcs" stroke={COLORS.violet} strokeWidth={2} dot={{ r: 2 }} name="Метрик" />
      </LineChart>
    </ResponsiveContainer>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">{children}</div>;
}
