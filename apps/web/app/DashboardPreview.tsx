"use client";

import {
  LineChart, Line, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { LOCALE } from "@/lib/features";

// Правка 10 (#7): превью дашборда на лендинге приведено в соответствие с реальным
// кабинетом (Александр: «на лендинге выглядело иначе, чем в ЛК»). Раскладка и блоки
// повторяют dashboard/page.tsx: карточки-экшены, гейдж здоровья, стоимость+заморозка,
// 4 KPI, скорости, мини-графики. Цифры — демо, валюта ₽ (RU) / $ (.com).
// Реальные компоненты НЕ импортируем (у них серверные пропсы из БД) — повторяем
// разметку и классы. Минус: при сильном редизайне ЛК превью надо будет подровнять.
const isEn = LOCALE === "en";

const L = isEn
  ? {
      updated: "updated 2 min ago",
      title: "Dashboard", warehouse: "Shopify",
      lowStock: "Running low", lowStockSub: "reorder in 7–14 days",
      lostRev: "Lost revenue", lostRevSub: "from out-of-stock days",
      dead: "Dead stock", deadSub: "SKU with no sales",
      health: "Warehouse health", healthTier: "Good",
      healthHint: "Doing well — a few growth points left.",
      invValue: "Inventory value", frozen: "Frozen",
      totalSku: "Total SKU", oos: "OOS", inactive: "Inactive", active: "Active",
      velHeader: "Sales velocity, units/day", fast: "Fast", mid: "Average", slow: "Slow",
      health14: "Health, 14 days", points: "+30 pts", segments: "SKU segments",
      lostRevVal: "$1.4k", frozenVal: "$8.2k", invVal: "$34.5k",
    }
  : {
      updated: "обновлено 2 мин назад",
      title: "Дашборд", warehouse: "Ozon FBO",
      lowStock: "Заканчивается", lowStockSub: "пополнить за 7–14 дней",
      lostRev: "Потерянная выручка", lostRevSub: "из-за дней без наличия",
      dead: "Неликвид", deadSub: "SKU без продаж",
      health: "Состояние склада", healthTier: "Хорошо",
      healthHint: "Склад работает хорошо — есть небольшие точки роста.",
      invValue: "Стоимость остатков", frozen: "В заморозке",
      totalSku: "Всего SKU", oos: "OOS", inactive: "Неактивные", active: "Активные",
      velHeader: "Скорость продаж, шт/день", fast: "Быстрые", mid: "Средние", slow: "Медленные",
      health14: "Здоровье, 14 дней", points: "+30 пунктов", segments: "Сегменты SKU",
      lostRevVal: "142 000 ₽", frozenVal: "820 000 ₽", invVal: "3 450 000 ₽",
    };

const HEALTH = 88; // демо-индекс здоровья (tier «Хорошо»)

const healthSeries = [
  { d: "01", v: 58 }, { d: "02", v: 61 }, { d: "03", v: 64 }, { d: "04", v: 62 },
  { d: "05", v: 67 }, { d: "06", v: 71 }, { d: "07", v: 74 }, { d: "08", v: 76 },
  { d: "09", v: 78 }, { d: "10", v: 81 }, { d: "11", v: 83 }, { d: "12", v: 84 },
  { d: "13", v: 86 }, { d: "14", v: 88 },
];

const segments = [
  { name: isEn ? "Fast" : "Быстрые",     value: 28, color: "#84cc16" },
  { name: isEn ? "Steady" : "Стабильные", value: 42, color: "#0284c7" },
  { name: isEn ? "Slow" : "Медленные",    value: 18, color: "#f59e0b" },
  { name: isEn ? "Dead" : "Неликвид",     value: 12, color: "#e11d48" },
];

export default function DashboardPreview() {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-10 -z-10 blur-3xl opacity-25"
        style={{ background: "radial-gradient(closest-side, rgba(132,204,22,0.18), transparent 70%)" }}
      />
      <div className="rounded-2xl border border-line bg-paper overflow-hidden shadow-[0_30px_80px_-25px_rgba(10,10,8,0.20)]">
        {/* chrome bar */}
        <div className="flex items-center justify-between border-b border-line px-4 md:px-5 py-3 bg-bg-soft/50">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-line-2" />
              <span className="size-2.5 rounded-full bg-line-2" />
              <span className="size-2.5 rounded-full bg-line-2" />
            </div>
            <span className="font-mono text-[9px] md:text-[10px] uppercase tracking-[0.2em] text-ink-hush">veloseller / dashboard</span>
          </div>
          <span className="font-mono text-[9px] md:text-[10px] text-ink-hush hidden sm:inline">{L.updated}</span>
        </div>

        <div className="p-4 md:p-5 space-y-4 md:space-y-5">
          {/* header row */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-lime-deep" />
              <span className="font-display text-lg md:text-xl font-medium text-ink">{L.title}</span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">{L.warehouse}</span>
            </div>
            <div className="flex gap-1 rounded-lg border border-line bg-bg-soft p-0.5 font-mono text-[10px] uppercase tracking-wider">
              <span className="px-2 py-1 rounded text-ink-hush">7</span>
              <span className="px-2 py-1 rounded bg-paper text-ink font-semibold shadow-sm">30</span>
              <span className="px-2 py-1 rounded text-ink-hush">90</span>
            </div>
          </div>

          {/* row 1: action cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
            <ActionCard tone="warn"   label={L.lowStock} value="7"            sub={L.lowStockSub} />
            <ActionCard tone="danger" label={L.lostRev}  value={L.lostRevVal} sub={L.lostRevSub} />
            <ActionCard tone="warn"   label={L.dead}     value="12"           sub={L.deadSub} />
          </div>

          {/* row 2: health + inventory */}
          <div className="grid gap-3 md:gap-4 md:grid-cols-2">
            <HealthBlock />
            <div className="rounded-2xl border border-line bg-paper p-4 sm:p-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold">{L.invValue}</div>
              <div className="mt-3 font-display text-2xl sm:text-3xl md:text-4xl tracking-tight font-medium text-ink tabular break-words">{L.invVal}</div>
              <div className="mt-4 rounded-lg border border-orange/20 bg-orange/5 p-3 flex items-center justify-between gap-3 flex-wrap">
                <span className="font-mono text-[10px] uppercase tracking-widest text-orange font-semibold">{L.frozen}</span>
                <span className="font-display tabular text-lg sm:text-xl text-orange font-medium break-words">{L.frozenVal}</span>
              </div>
            </div>
          </div>

          {/* row 3: 4 kpi */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label={L.totalSku} value="1 883" />
            <Kpi label={L.oos}      value="3"     tone="warn" />
            <Kpi label={L.inactive} value="24"    tone="muted" />
            <Kpi label={L.active}   value="1 859" tone="accent" />
          </div>

          {/* row 4: velocity */}
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold mb-2.5">{L.velHeader}</div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <Velocity tone="fast" label={L.fast} value="3.21" />
              <Velocity tone="mid"  label={L.mid}  value="1.40" />
              <Velocity tone="slow" label={L.slow} value="0.41" />
            </div>
          </div>

          {/* row 5: charts */}
          <div className="grid gap-3 md:gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-line bg-paper p-3 md:p-4">
              <div className="flex justify-between items-center mb-2">
                <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">{L.health14}</div>
                <div className="font-mono text-[11px] text-lime-deep font-semibold">{L.points}</div>
              </div>
              <div className="h-[80px] md:h-[90px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={healthSeries}>
                    <Line type="monotone" dataKey="v" stroke="#3f6212" strokeWidth={2.2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-paper p-3 md:p-4">
              <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush mb-2">{L.segments}</div>
              <div className="flex items-center gap-4">
                <div className="h-[80px] w-[80px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={segments} dataKey="value" nameKey="name" innerRadius={22} outerRadius={38} paddingAngle={2} stroke="none">
                        {segments.map((s, i) => <Cell key={i} fill={s.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-1.5">
                  {segments.map((s) => (
                    <div key={s.name} className="flex items-center gap-2">
                      <span className="size-2 rounded-full shrink-0" style={{ background: s.color }} />
                      <span className="font-mono text-[11px] text-ink-soft uppercase tracking-wider flex-1">{s.name}</span>
                      <span className="font-mono text-[11px] text-ink-muted tabular">{s.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionCard({ tone, label, value, sub }: { tone: "warn" | "danger"; label: string; value: string; sub: string }) {
  const toneClasses = tone === "danger" ? "border-rose/30 bg-rose/5" : "border-orange/30 bg-orange/5";
  const c = tone === "danger" ? "text-rose" : "text-orange";
  const cSub = tone === "danger" ? "text-rose/80" : "text-orange/80";
  return (
    <div className={`rounded-2xl border-2 p-4 ${toneClasses}`}>
      <div className={`font-mono text-[10px] uppercase tracking-widest font-semibold ${c}`}>{label}</div>
      <div className={`mt-2 font-display text-2xl sm:text-3xl tabular font-medium tracking-tight break-words ${c}`}>{value}</div>
      <div className={`mt-1.5 text-xs leading-relaxed ${cSub}`}>{sub}</div>
    </div>
  );
}

function HealthBlock() {
  return (
    <div className="rounded-2xl border border-line bg-paper p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold">{L.health}</div>
        <span className="inline-flex items-center font-mono text-[10px] px-2 py-0.5 uppercase tracking-widest rounded border font-semibold whitespace-nowrap text-lime-deep border-lime-deep/30 bg-lime-soft">
          {L.healthTier}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-display tabular tracking-tight font-medium text-[2.5rem] sm:text-[3.25rem]" style={{ lineHeight: 1, color: "#3f6212" }}>{HEALTH}</span>
        <span className="text-ink-hush font-mono text-base sm:text-lg">/100</span>
      </div>
      <div className="mt-5 relative">
        <div className="h-2 rounded-full bg-bg-soft border border-line overflow-hidden">
          <div className="h-full bg-gradient-to-r from-rose via-orange to-lime-deep" style={{ width: "100%" }} />
        </div>
        <div className="absolute top-1/2 -translate-y-1/2 size-3 rounded-full bg-ink border-2 border-paper shadow-md" style={{ left: `calc(${HEALTH}% - 6px)` }} />
        <div className="mt-2 flex justify-between font-mono text-[9px] text-ink-hush uppercase tracking-wider">
          <span>0</span><span>40</span><span>60</span><span>75</span><span>90</span><span>100</span>
        </div>
      </div>
      <p className="mt-4 text-xs text-ink-muted leading-relaxed">{L.healthHint}</p>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "warn" | "muted" | "accent" }) {
  const valueColor =
    tone === "warn"   ? "text-orange" :
    tone === "muted"  ? "text-ink-hush" :
    tone === "accent" ? "text-lime-deep" :
                        "text-ink";
  return (
    <div className="rounded-2xl border border-line bg-paper p-3 sm:p-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">{label}</div>
      <div className={`mt-1.5 font-display text-xl sm:text-2xl md:text-3xl tabular font-medium tracking-tight ${valueColor}`}>{value}</div>
    </div>
  );
}

function Velocity({ tone, label, value }: { tone: "fast" | "mid" | "slow"; label: string; value: string }) {
  const border = tone === "fast" ? "border-l-lime-deep" : tone === "mid" ? "border-l-azure" : "border-l-orange";
  const text   = tone === "fast" ? "text-lime-deep"     : tone === "mid" ? "text-azure"     : "text-orange";
  return (
    <div className={`bg-paper border border-line border-l-4 rounded-xl p-3 sm:p-4 ${border}`}>
      <div className="font-mono text-[9px] sm:text-[10px] uppercase tracking-widest text-ink-hush">{label}</div>
      <div className={`mt-1 font-display text-lg sm:text-xl md:text-2xl tabular font-medium ${text}`}>{value}</div>
    </div>
  );
}
