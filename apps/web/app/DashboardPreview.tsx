"use client";

import { LineChart, Line, ResponsiveContainer, BarChart, Bar, Tooltip, XAxis, Cell } from "recharts";

const healthSeries = [
  { d: "01", v: 58 }, { d: "02", v: 61 }, { d: "03", v: 64 }, { d: "04", v: 62 },
  { d: "05", v: 67 }, { d: "06", v: 71 }, { d: "07", v: 74 }, { d: "08", v: 76 },
  { d: "09", v: 78 }, { d: "10", v: 81 }, { d: "11", v: 83 }, { d: "12", v: 84 },
  { d: "13", v: 86 }, { d: "14", v: 88 },
];

const skuRows = [
  { sku: "NK-PEG-41",   name: "Кроссовки Nike Pegasus 41",      tv: 3.21, cov:  9, alert: "low_stock" },
  { sku: "AD-ULTRA-22", name: "Adidas Ultraboost 22",            tv: 1.82, cov: 24, alert: null },
  { sku: "ASC-NOV",     name: "Asics Novablast 4",               tv: 0.41, cov:189, alert: "dead_inv" },
  { sku: "NB-1080-13",  name: "New Balance 1080v13",             tv: 2.05, cov: 31, alert: null },
];

const segments = [
  { name: "fast",   value: 28, color: "#a3e635" },
  { name: "steady", value: 42, color: "#22d3ee" },
  { name: "slow",   value: 18, color: "#fbbf24" },
  { name: "dead",   value: 12, color: "#fb923c" },
];

export default function DashboardPreview() {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-10 -z-10 blur-3xl opacity-30"
        style={{ background: "radial-gradient(closest-side, rgba(163,230,53,0.25), transparent 70%)" }}
      />
      <div className="rounded-2xl border border-[#1f2a23] bg-[#0f1310] overflow-hidden shadow-2xl shadow-black/50">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-[#1f2a23] px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-[#3b4a40]" />
              <span className="size-2.5 rounded-full bg-[#3b4a40]" />
              <span className="size-2.5 rounded-full bg-[#3b4a40]" />
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#7a8b80]">veloseller / dashboard</span>
          </div>
          <span className="font-mono text-[10px] text-[#7a8b80]">обновлено · 2 мин назад</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-px bg-[#1f2a23]">
          {/* KPI блок */}
          <div className="lg:col-span-8 bg-[#0f1310] p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[#1f2a23] rounded-xl overflow-hidden">
              <Kpi label="Health" value="88" suffix="/100" tone="good" />
              <Kpi label="OOS SKU"        value="3"   tone="warn" />
              <Kpi label="Lost revenue"  value="$1.4k" tone="bad" />
              <Kpi label="В заморозке"   value="$8.2k" tone="warn" />
            </div>

            {/* Health trend */}
            <div className="mt-5 rounded-xl border border-[#1f2a23] p-4">
              <div className="flex justify-between items-center mb-2">
                <div className="font-mono text-[10px] uppercase tracking-widest text-[#7a8b80]">Health, 14 дней</div>
                <div className="font-mono text-[11px] text-[#a3e635]">+30 пунктов</div>
              </div>
              <div className="h-[90px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={healthSeries}>
                    <Line type="monotone" dataKey="v" stroke="#a3e635" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Сегменты */}
          <div className="lg:col-span-4 bg-[#0f1310] p-5">
            <div className="font-mono text-[10px] uppercase tracking-widest text-[#7a8b80] mb-3">Сегменты SKU</div>
            <div className="space-y-2.5">
              {segments.map((s) => (
                <div key={s.name} className="flex items-center gap-3">
                  <span className="size-2 rounded-full" style={{ background: s.color }} />
                  <span className="font-mono text-xs text-[#d4dcd6] uppercase tracking-wider w-16">{s.name}</span>
                  <div className="flex-1 h-1.5 bg-[#1f2a23] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${s.value}%`, background: s.color }} />
                  </div>
                  <span className="font-mono text-xs text-[#7a8b80] tabular w-7 text-right">{s.value}</span>
                </div>
              ))}
            </div>

            {/* Bar mini */}
            <div className="mt-5 rounded-xl border border-[#1f2a23] p-4">
              <div className="font-mono text-[10px] uppercase tracking-widest text-[#7a8b80] mb-2">Velocity Top-5</div>
              <div className="h-[78px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[
                    { n: "A", v: 3.2 }, { n: "B", v: 2.7 }, { n: "C", v: 2.05 }, { n: "D", v: 1.82 }, { n: "E", v: 1.5 },
                  ]}>
                    <Bar dataKey="v" radius={[3,3,0,0]}>
                      {[0,1,2,3,4].map((i) => (
                        <Cell key={i} fill={i < 2 ? "#a3e635" : i < 4 ? "#22d3ee" : "#7a8b80"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* SKU table */}
          <div className="lg:col-span-12 bg-[#0f1310] p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="font-mono text-[10px] uppercase tracking-widest text-[#7a8b80]">SKU с алертами</div>
              <div className="font-mono text-[10px] text-[#fb923c]">2 требуют внимания</div>
            </div>
            <div className="divide-y divide-[#1f2a23] border border-[#1f2a23] rounded-xl overflow-hidden">
              {skuRows.map((r) => (
                <div key={r.sku} className="grid grid-cols-12 items-center gap-3 px-4 py-2.5 hover:bg-[#161c18] transition">
                  <span className="col-span-3 font-mono text-[11px] text-[#7a8b80]">{r.sku}</span>
                  <span className="col-span-5 text-[13px] text-[#d4dcd6]">{r.name}</span>
                  <span className="col-span-2 font-mono text-[13px] text-[#a3e635] tabular">{r.tv.toFixed(2)}</span>
                  <span className="col-span-1 font-mono text-[11px] text-[#7a8b80] tabular text-right">{r.cov}д</span>
                  <span className="col-span-1 text-right">
                    {r.alert === "low_stock" && <Pill tone="warn">low</Pill>}
                    {r.alert === "dead_inv"  && <Pill tone="bad">dead</Pill>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, suffix, tone }: {
  label: string; value: string; suffix?: string;
  tone?: "good" | "warn" | "bad";
}) {
  const color =
    tone === "good" ? "#a3e635" :
    tone === "warn" ? "#fbbf24" :
    tone === "bad"  ? "#fb923c" : "#d4dcd6";
  return (
    <div className="bg-[#0f1310] p-4">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#7a8b80]">{label}</div>
      <div className="mt-1.5 font-display tabular" style={{ color, fontSize: "1.7rem", lineHeight: 1, letterSpacing: "-0.03em" }}>
        {value}
        {suffix && <span className="text-base text-[#4b5a52] ml-1">{suffix}</span>}
      </div>
    </div>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone: "warn" | "bad" }) {
  const cls = tone === "warn"
    ? "text-[#fbbf24] border-[#fbbf24]/30 bg-[#fbbf24]/10"
    : "text-[#fb923c] border-[#fb923c]/30 bg-[#fb923c]/10";
  return (
    <span className={`inline-block font-mono text-[9.5px] uppercase tracking-widest px-1.5 py-0.5 rounded border ${cls}`}>
      {children}
    </span>
  );
}
