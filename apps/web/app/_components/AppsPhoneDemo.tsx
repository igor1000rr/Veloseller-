"use client";
import { useEffect, useState } from "react";

// Анимированный демо-экран приложения: метрики циклически сменяются (fade-up),
// столбики продаж плавно морфят по высоте. Чистый CSS-переход + setInterval.
const SCREENS = [
  { label: "дней до нуля", value: "12", sub: "SKU-1024 · пора дозаказать", text: "text-lime-deep", chip: "bg-lime-soft", bar: "from-lime-deep/40 to-lime-deep", bars: [40, 62, 55, 78, 60, 90, 72] },
  { label: "остаток, шт", value: "842", sub: "−68 в день по всем складам", text: "text-azure", chip: "bg-azure/10", bar: "from-azure/40 to-azure", bars: [72, 58, 63, 50, 54, 42, 36] },
  { label: "потеряно, ₽", value: "31 400", sub: "из-за out-of-stock за месяц", text: "text-orange", chip: "bg-orange/10", bar: "from-orange/40 to-orange", bars: [22, 46, 32, 66, 52, 80, 95] },
];

const IDX = [0, 1, 2, 3, 4, 5, 6];

export default function AppsPhoneDemo() {
  const [i, setI] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setI((p) => (p + 1) % SCREENS.length), 2600);
    return () => clearInterval(t);
  }, []);

  const s = SCREENS[i];

  return (
    <div className="flex justify-center">
      <div className="relative w-[280px] rounded-[2.4rem] border border-line bg-paper p-3 shadow-2xl">
        <div className="absolute left-1/2 top-2 h-1.5 w-20 -translate-x-1/2 rounded-full bg-line" />
        <div className="rounded-[1.8rem] bg-gradient-to-b from-bg-soft to-paper overflow-hidden text-left pt-3">
          <div className="px-4 pt-3 pb-3 flex items-center justify-between">
            <span className="font-display text-sm font-medium">Velo<span className="text-lime-deep">seller</span></span>
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-lime-deep animate-pulse" />
              <span className="font-mono text-[9px] text-ink-hush uppercase">live</span>
            </span>
          </div>
          <div className="px-4 pb-5 space-y-2.5">
            <div key={i} className="reveal rounded-xl border border-line p-4">
              <div className={"inline-flex rounded-md px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider " + s.chip + " " + s.text}>{s.label}</div>
              <div className={"mt-2 font-display text-4xl font-medium tabular " + s.text}>{s.value}</div>
              <div className="mt-1 font-mono text-[10px] text-ink-hush">{s.sub}</div>
            </div>
            <div className="rounded-xl border border-line p-4">
              <div className="font-mono text-[9px] text-ink-hush uppercase tracking-wider">продажи · 7 дней</div>
              <div className="mt-3 flex items-end gap-1.5 h-12">
                {IDX.map((k) => (
                  <span
                    key={k}
                    className={"flex-1 rounded-sm bg-gradient-to-t transition-all duration-700 ease-out " + s.bar}
                    style={{ height: s.bars[k] + "%" }}
                  />
                ))}
              </div>
            </div>
            <div className="rounded-lg bg-ink text-paper text-center py-2.5 text-xs font-semibold">Дозаказать 1 200 шт</div>
          </div>
        </div>
      </div>
    </div>
  );
}
