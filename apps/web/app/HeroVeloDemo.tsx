"use client";

import { useMemo, useState } from "react";
import { Icons } from "./_components/Icons";

export default function HeroVeloDemo() {
  const [oos, setOos] = useState(8);
  const sales = 60;
  const period = 30;
  const inStockDays = Math.max(period - oos, 1);

  const naive = useMemo(() => sales / period, []);
  const tvelo = useMemo(() => sales / inStockDays, [inStockDays]);
  const lift = ((tvelo - naive) / naive) * 100;

  const series = useMemo(() => {
    const days = period;
    const oosStart = Math.floor((days - oos) / 2);
    return Array.from({ length: days }, (_, i) => {
      if (i >= oosStart && i < oosStart + oos) return 0;
      const base = 2.5;
      const wobble = Math.sin(i * 0.9) * 0.7 + Math.cos(i * 1.7) * 0.4;
      return Math.max(0, base + wobble);
    });
  }, [oos]);

  const maxY = Math.max(...series, 1);
  const W = 320, H = 84, pad = 4;
  const stepX = (W - pad * 2) / (series.length - 1);
  const path = series
    .map((v, i) => `${i === 0 ? "M" : "L"} ${pad + i * stepX} ${H - pad - (v / maxY) * (H - pad * 2)}`)
    .join(" ");
  const areaPath = `${path} L ${pad + (series.length - 1) * stepX} ${H - pad} L ${pad} ${H - pad} Z`;

  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-8 -z-10 blur-3xl opacity-50"
        style={{ background: "radial-gradient(closest-side, rgba(132,204,22,0.25), transparent 70%)" }}
      />
      <div className="rounded-2xl border border-line bg-paper p-4 md:p-7 shadow-[0_20px_50px_-15px_rgba(10,10,8,0.20)]">
        <div className="flex items-center justify-between mb-4 md:mb-5">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-rose/70" />
            <span className="size-2 rounded-full bg-orange/70" />
            <span className="size-2 rounded-full bg-lime/70" />
            <span className="ml-2 md:ml-3 font-mono text-[9px] md:text-[10px] uppercase tracking-[0.18em] text-ink-hush">
              veloseller / live demo
            </span>
          </div>
          <span className="font-mono text-[10px] text-lime-deep blink">LIVE</span>
        </div>

        <div>
          <div className="font-mono text-[10px] md:text-[11px] uppercase tracking-widest text-ink-hush">SKU / Nike Pegasus 41</div>
          <div className="mt-1 font-mono text-xs text-ink-muted">
            продано <span className="text-ink tabular">60</span> шт за <span className="tabular">30</span> дней
          </div>
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 md:mt-5 w-full h-[72px] md:h-[84px]" preserveAspectRatio="none">
          <defs>
            <linearGradient id="hgrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#84cc16" stopOpacity="0.30" />
              <stop offset="100%" stopColor="#84cc16" stopOpacity="0" />
            </linearGradient>
          </defs>
          {(() => {
            const start = series.findIndex((v) => v === 0);
            const end = series.findLastIndex((v) => v === 0);
            if (start < 0 || end < 0) return null;
            const x1 = pad + start * stepX;
            const x2 = pad + end * stepX;
            return (
              <g>
                <rect x={x1} y={pad} width={Math.max(x2 - x1, 2)} height={H - pad * 2} fill="#ea580c" fillOpacity="0.12" />
                <text x={(x1 + x2) / 2} y={H - pad - 4} textAnchor="middle" className="font-mono"
                  fill="#ea580c" fontSize="9" letterSpacing="0.1em">OOS</text>
              </g>
            );
          })()}
          <path d={areaPath} fill="url(#hgrad)" />
          <path d={path} fill="none" stroke="#3f6212" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>

        <div className="mt-5">
          <div className="flex justify-between items-center mb-2">
            <label htmlFor="oos" className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">
              Дней без товара
            </label>
            <span className="font-mono text-sm text-orange tabular font-semibold">{oos} / 30 дней</span>
          </div>
          <input
            id="oos"
            type="range"
            min={0}
            max={20}
            value={oos}
            onChange={(e) => setOos(parseInt(e.target.value))}
            className="w-full accent-lime-deep cursor-pointer"
          />
        </div>

        <div className="mt-5 md:mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-line bg-bg-soft p-3 md:p-4">
            <div className="font-mono text-[9px] md:text-[10px] uppercase tracking-widest text-ink-hush">обычная скорость продаж</div>
            <div className="mt-1 font-mono text-2xl md:text-3xl text-ink-hush tabular line-through decoration-orange decoration-2">
              {naive.toFixed(2)}
            </div>
            <div className="mt-0.5 font-mono text-[9px] md:text-[10px] text-ink-hush">шт / день</div>
          </div>
          <div className="rounded-lg border-2 border-lime-deep/40 bg-lime-soft p-3 md:p-4 relative overflow-hidden">
            <div className="font-mono text-[9px] md:text-[10px] uppercase tracking-widest text-lime-deep font-semibold">TVelo</div>
            <div className="mt-1 font-mono text-2xl md:text-3xl text-ink tabular font-semibold">{tvelo.toFixed(2)}</div>
            <div className="mt-0.5 font-mono text-[9px] md:text-[10px] text-ink-muted">
              шт/день · <span className="text-lime-deep font-semibold">+{lift.toFixed(0)}%</span>
            </div>
          </div>
        </div>

        <p className="mt-4 md:mt-5 text-xs md:text-[12.5px] leading-relaxed text-ink-muted">
          Делить продажи на 30 — неверно: <span className="text-orange font-semibold">{oos} дней</span> товара
          не было на складе. TVelo считает только <span className="text-lime-deep font-semibold">дни в наличии</span>.
        </p>
      </div>
    </div>
  );
}
