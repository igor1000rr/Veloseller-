"use client";

import { LineChart, Line, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";
import { t } from "@/lib/i18n";
import { LOCALE } from "@/lib/features";

const isEn = LOCALE === "en";

const healthSeries = [
  { d: "01", v: 58 }, { d: "02", v: 61 }, { d: "03", v: 64 }, { d: "04", v: 62 },
  { d: "05", v: 67 }, { d: "06", v: 71 }, { d: "07", v: 74 }, { d: "08", v: 76 },
  { d: "09", v: 78 }, { d: "10", v: 81 }, { d: "11", v: 83 }, { d: "12", v: 84 },
  { d: "13", v: 86 }, { d: "14", v: 88 },
];

const skuRows = [
  { sku: "NK-PEG-41",   name: isEn ? "Nike Pegasus 41 Running Shoes" : "Кроссовки Nike Pegasus 41", tv: 3.21, cov:  9, alert: "low" },
  { sku: "AD-ULTRA-22", name: "Adidas Ultraboost 22",            tv: 1.82, cov: 24, alert: null },
  { sku: "ASC-NOV",     name: "Asics Novablast 4",               tv: 0.41, cov:189, alert: "dead" },
  { sku: "NB-1080-13",  name: "New Balance 1080v13",             tv: 2.05, cov: 31, alert: null },
];

const segments = [
  { name: "fast",   value: 28, color: "#84cc16" },
  { name: "steady", value: 42, color: "#0284c7" },
  { name: "slow",   value: 18, color: "#f59e0b" },
  { name: "dead",   value: 12, color: "#e11d48" },
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
        <div className="flex items-center justify-between border-b border-line px-4 md:px-5 py-3 bg-bg-soft/50">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-line-2" />
              <span className="size-2.5 rounded-full bg-line-2" />
              <span className="size-2.5 rounded-full bg-line-2" />
            </div>
            <span className="font-mono text-[9px] md:text-[10px] uppercase tracking-[0.2em] text-ink-hush">veloseller / dashboard</span>
          </div>
          <span className="font-mono text-[9px] md:text-[10px] text-ink-hush hidden sm:inline">{t("landing.dp.updated")}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-px bg-line">
          <div className="lg:col-span-8 bg-paper p-4 md:p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line rounded-xl overflow-hidden">
              <Kpi label="Health"        value="88"    suffix="/100" tone="good" />
              <Kpi label="OOS SKU"       value="3"     tone="warn" />
              <Kpi label="Lost revenue"  value="$1.4k" tone="bad" />
              <Kpi label={t("landing.dp.frozen")}   value="$8.2k" tone="warn" />
            </div>

            <div className="mt-4 md:mt-5 rounded-xl border border-line p-3 md:p-4 bg-paper">
              <div className="flex justify-between items-center mb-2">
                <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">{t("landing.dp.health14")}</div>
                <div className="font-mono text-[11px] text-lime-deep font-semibold">{t("landing.dp.points")}</div>
              </div>
              <div className="h-[80px] md:h-[90px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={healthSeries}>
                    <Line type="monotone" dataKey="v" stroke="#3f6212" strokeWidth={2.2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 bg-paper p-4 md:p-5">
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush mb-3">{t("landing.dp.segments")}</div>
            <div className="space-y-2.5">
              {segments.map((s) => (
                <div key={s.name} className="flex items-center gap-3">
                  <span className="size-2 rounded-full" style={{ background: s.color }} />
                  <span className="font-mono text-[11px] md:text-xs text-ink-soft uppercase tracking-wider w-14 md:w-16">{s.name}</span>
                  <div className="flex-1 h-1.5 bg-line rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${s.value}%`, background: s.color }} />
                  </div>
                  <span className="font-mono text-xs text-ink-muted tabular w-6 md:w-7 text-right">{s.value}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 md:mt-5 rounded-xl border border-line p-3 md:p-4">
              <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush mb-2">Velocity Top-5</div>
              <div className="h-[68px] md:h-[78px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[
                    { n: "A", v: 3.2 }, { n: "B", v: 2.7 }, { n: "C", v: 2.05 }, { n: "D", v: 1.82 }, { n: "E", v: 1.5 },
                  ]}>
                    <Bar dataKey="v" radius={[3,3,0,0]}>
                      {[0,1,2,3,4].map((i) => (
                        <Cell key={i} fill={i < 2 ? "#84cc16" : i < 4 ? "#0284c7" : "#a5ada3"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="lg:col-span-12 bg-paper p-4 md:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">{t("landing.dp.alerts")}</div>
              <div className="font-mono text-[10px] text-orange font-semibold">{t("landing.dp.needAttention")}</div>
            </div>
            <div className="divide-y divide-line border border-line rounded-xl overflow-hidden">
              {skuRows.map((r) => (
                <div key={r.sku} className="grid grid-cols-12 items-center gap-2 md:gap-3 px-3 md:px-4 py-2.5 hover:bg-bg-soft transition">
                  <span className="col-span-4 md:col-span-3 font-mono text-[10px] md:text-[11px] text-ink-hush">{r.sku}</span>
                  <span className="col-span-4 md:col-span-5 text-[12px] md:text-[13px] text-ink-soft truncate">{r.name}</span>
                  <span className="col-span-2 font-mono text-[12px] md:text-[13px] text-lime-deep tabular font-semibold">{r.tv.toFixed(2)}</span>
                  <span className="hidden md:inline col-span-1 font-mono text-[11px] text-ink-hush tabular text-right">{r.cov}{t("landing.dp.d")}</span>
                  <span className="col-span-2 md:col-span-1 text-right">
                    {r.alert === "low"  && <Pill tone="warn">low</Pill>}
                    {r.alert === "dead" && <Pill tone="bad">dead</Pill>}
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

function Kpi({ label, value, suffix, tone }: { label: string; value: string; suffix?: string; tone?: "good" | "warn" | "bad"; }) {
  const color =
    tone === "good" ? "#3f6212" :
    tone === "warn" ? "#b45309" :
    tone === "bad"  ? "#be123c" : "#1f2017";
  return (
    <div className="bg-paper p-3 md:p-4">
      <div className="font-mono text-[9px] md:text-[9.5px] uppercase tracking-[0.18em] text-ink-hush">{label}</div>
      <div className="mt-1.5 font-display tabular font-medium" style={{ color, fontSize: "1.5rem", lineHeight: 1, letterSpacing: "-0.03em" }}>
        {value}
        {suffix && <span className="text-sm text-ink-hush ml-1">{suffix}</span>}
      </div>
    </div>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone: "warn" | "bad" }) {
  const cls = tone === "warn"
    ? "text-orange border-orange/30 bg-orange/10"
    : "text-rose border-rose/30 bg-rose/10";
  return (
    <span className={`inline-block font-mono text-[9px] md:text-[9.5px] uppercase tracking-widest px-1.5 py-0.5 rounded border font-semibold ${cls}`}>
      {children}
    </span>
  );
}
