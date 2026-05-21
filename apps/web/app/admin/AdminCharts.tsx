"use client";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, RadialBarChart, RadialBar } from "recharts";

const COLORS = {
  lime:    "#84cc16",
  limeDeep:"#3f6212",
  emerald: "#065f46",
  azure:   "#0284c7",
  orange:  "#ea580c",
  rose:    "#e11d48",
  ink:     "#0a0a08",
  hush:    "#8a8a7e",
  line:    "#e6e3d4",
};

const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid #e6e3d4",
  background: "#ffffff",
  fontSize: 12,
  fontFamily: "var(--font-mono)",
};

/** Компактный формат рублей для осей: 12500 → 12.5K, 1500000 → 1.5M. */
function compactRub(value: number): string {
  if (!isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M ₽`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}K ₽`;
  return `${Math.round(value)} ₽`;
}

function fullRub(value: number): string {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value)} ₽`;
}

export function RegistrationsChart({ data }: { data: { date: string; count: number }[] }) {
  if (!data || data.length === 0) return <Empty>Регистраций пока нет</Empty>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="regGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.lime} stopOpacity={0.35} />
            <stop offset="100%" stopColor={COLORS.lime} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} vertical={false} />
        <XAxis dataKey="date" stroke={COLORS.hush} fontSize={10} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis stroke={COLORS.hush} fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Area type="monotone" dataKey="count" stroke={COLORS.limeDeep} strokeWidth={2} fill="url(#regGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function SnapshotsChart({ data }: { data: { date: string; count: number }[] }) {
  if (!data || data.length === 0) return <Empty>Снимков нет</Empty>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} vertical={false} />
        <XAxis dataKey="date" stroke={COLORS.hush} fontSize={10} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis stroke={COLORS.hush} fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="count" fill={COLORS.azure} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PlansPieChart({ data }: { data: { plan: string; count: number }[] }) {
  const palette: Record<string, string> = {
    trial:   COLORS.hush,
    starter: COLORS.azure,
    growth:  COLORS.lime,
    pro:     COLORS.limeDeep,
  };
  const filtered = (data ?? []).filter(d => d.count > 0);
  if (filtered.length === 0) return <Empty>Селлеров нет</Empty>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={filtered} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="count" nameKey="plan">
          {filtered.map((e, i) => <Cell key={i} fill={palette[e.plan] ?? COLORS.hush} />)}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function MrrChart({ data }: { data: { date: string; mrr: number }[] }) {
  if (!data || data.length === 0) return <Empty>Нет платежей</Empty>;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.limeDeep} stopOpacity={0.4} />
            <stop offset="100%" stopColor={COLORS.limeDeep} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} vertical={false} />
        <XAxis dataKey="date" stroke={COLORS.hush} fontSize={10} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis stroke={COLORS.hush} fontSize={10} tickLine={false} axisLine={false} tickFormatter={compactRub} width={70} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => fullRub(Number(v))} />
        <Area type="monotone" dataKey="mrr" stroke={COLORS.limeDeep} strokeWidth={2.2} fill="url(#mrrGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function HealthRadial({ value }: { value: number }) {
  const data = [{ name: "health", value, fill: value > 70 ? COLORS.lime : value > 40 ? COLORS.orange : COLORS.rose }];
  return (
    <ResponsiveContainer width="100%" height={180}>
      <RadialBarChart cx="50%" cy="50%" innerRadius="70%" outerRadius="100%" barSize={12} data={data} startAngle={90} endAngle={-270}>
        <RadialBar background={{ fill: COLORS.line } as any} dataKey="value" cornerRadius={6} />
      </RadialBarChart>
    </ResponsiveContainer>
  );
}

export function ActivityChart({ data }: { data: { date: string; snapshots: number; recalcs: number }[] }) {
  if (!data || data.length === 0) return <Empty>Активности нет</Empty>;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} vertical={false} />
        <XAxis dataKey="date" stroke={COLORS.hush} fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke={COLORS.hush} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line type="monotone" dataKey="snapshots" stroke={COLORS.azure} strokeWidth={2} dot={{ r: 2 }} name="Snapshots" />
        <Line type="monotone" dataKey="recalcs" stroke={COLORS.limeDeep} strokeWidth={2} dot={{ r: 2 }} name="Метрик" />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function HourlyHeatmap({ data }: { data: { hour: number; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
      {data.map((d) => {
        const intensity = d.count / max;
        const opacity = d.count === 0 ? 0.08 : 0.25 + intensity * 0.75;
        return (
          <div key={d.hour} className="flex flex-col items-center gap-1">
            <div
              className="w-full aspect-square rounded"
              style={{ background: COLORS.lime, opacity }}
              title={`${d.hour}:00 — ${d.count}`}
            />
            {d.hour % 3 === 0 && <span className="font-mono text-[9px] text-ink-hush">{String(d.hour).padStart(2, "0")}</span>}
          </div>
        );
      })}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[200px] flex items-center justify-center text-sm text-ink-hush font-mono">
      {children}
    </div>
  );
}
