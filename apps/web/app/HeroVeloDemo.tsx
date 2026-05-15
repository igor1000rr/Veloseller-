"use client";

import { useMemo, useState } from "react";

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
        style={{ background: "radial-gradient(closest-side, rgba(77,124,15,0.18), transparent 70%)" }}
      />
      <div className="rounded-2xl border border-line bg-paper p-4 sm:p-5 md:p-7 shadow-[0_20px_50px_-15px_rgba(10,20,16,0.18)]">
        {/* Window header */}
        <div className="flex items-center justify-between mb-4 sm:mb-5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="size-2 rounded-full bg-rose/60" />
            <span className="size-2 rounded-full bg-orange/70" />
            <span className="size-2 rounded-full bg-lime-deep/70" />
            <span className="ml-2 sm:ml-3 font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.18em] text-ink-hush truncate">
              veloseller / live demo
            </span>
          </div>
          <span className="font-mono text-[10px] text-lime-deep blink shrink-0">LIVE</span>
        </div>

        {/* Case header */}
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">SKU</div>
          <div className="mt-0.5 text-sm font-medium text-ink truncate">Nike Pegasus 41</div>
          <div className="mt-1 font-mono text-xs text-ink-muted">
            <span className="text-ink tabular">60</span> шт / <span className="tabular">30</span> дней
          </div>
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 sm:mt-5 w-full h-[72px] sm:h-[84px]" preserveAspectRatio="none">
          <defs>
            <linearGradient id="hgrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4d7c0f" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#4d7c0f" stopOpacity="0" />
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
                <rect x={x1} y={pad} width={Math.max(x2 - x1, 2)} height={H - pad * 2} fill="#c2410c" fillOpacity="0.10" />
                <text x={(x1 + x2) / 2} y={H - pad - 4} textAnchor="middle" className="font-mono"
                  fill="#c2410c" fontSize="9" letterSpacing="0.1em">OOS</text>
              </g>
            );
          })()}
          <path d={areaPath} fill="url(#hgrad)" />
          <path d={path} fill="none" stroke="#4d7c0f" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>

        {/* Slider */}
        <div className="mt-4 sm:mt-5">
          <div className="flex justify-between items-center mb-2">
            <label htmlFor="oos" className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">
              Дней без товара
            </label>
            <span className="font-mono text-sm text-orange tabular">{oos} / 30</span>
          </div>
          <input
            id="oos"
            type="range"
            min={0}
            max={20}
            value={oos}
            onChange={(e) => setOos(parseInt(e.target.value))}
            className="w-full accent-lime-deep cursor-pointer touch-pan-x"
          />
        </div>

        {/* Comparison */}
        <div className="mt-5 sm:mt-6 grid grid-cols-2 gap-2 sm:gap-3">
          <div className="rounded-lg border border-line bg-bg-soft p-3 sm:p-4">
            <div className="font-mono text-[9.5px] uppercase tracking-widest text-ink-hush">Наивная</div>
            <div className="mt-1 font-display text-2xl sm:text-3xl text-ink-hush tabular line-through decoration-orange/70 decoration-2">
              {naive.toFixed(2)}
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-ink-hush">шт / день</div>
          </div>
          <div className="rounded-lg border-2 border-lime-deep/30 bg-lime-soft p-3 sm:p-4 relative overflow-hidden">
            <div className="font-mono text-[9.5px] uppercase tracking-widest text-lime-deep font-semibold">TVelo</div>
            <div className="mt-1 font-display text-2xl sm:text-3xl text-ink tabular">{tvelo.toFixed(2)}</div>
            <div className="mt-0.5 font-mono text-[10px] text-ink-muted">
              шт/день <Dot /> <span className="text-lime-deep font-semibold">+{lift.toFixed(0)}%</span>
            </div>
          </div>
        </div>

        <p className="mt-4 sm:mt-5 text-[12.5px] leading-relaxed text-ink-muted">
          Поделить продажи на 30 — это неправильно:{" "}
          <span className="text-orange font-medium">{oos} дней</span> товара не было на складе.{" "}
          TVelo считает только <span className="text-lime-deep font-medium">дни доступности</span>.
        </p>
      </div>
    </div>
  );
}

function Dot() {
  return <span className="inline-block size-[3px] rounded-full bg-current opacity-50 mx-1 align-middle" />;
}
