"use client";

import { useMemo, useState } from "react";

/**
 * Интерактивный hero-калькулятор:
 * показывает разницу между «наивной» velocity (sales / period) и TVelo (sales / in_stock_days).
 * Слайдер OOS-дней меняет цифры в реальном времени — это и есть суть продукта.
 */
export default function HeroVeloDemo() {
  const [oos, setOos] = useState(8);
  const sales = 60;
  const period = 30;
  const inStockDays = Math.max(period - oos, 1);

  const naive = useMemo(() => sales / period, []);
  const tvelo = useMemo(() => sales / inStockDays, [inStockDays]);
  const lift = ((tvelo - naive) / naive) * 100;

  // Sparkline данные: имитация ежедневных продаж где OOS дни = 0
  const series = useMemo(() => {
    const days = period;
    const oosStart = Math.floor((days - oos) / 2);
    return Array.from({ length: days }, (_, i) => {
      if (i >= oosStart && i < oosStart + oos) return 0;
      // Чуть рандомный паттерн (детерминированный по индексу)
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
      {/* glow за карточкой */}
      <div
        aria-hidden
        className="absolute -inset-8 -z-10 blur-3xl opacity-40"
        style={{ background: "radial-gradient(closest-side, rgba(163,230,53,0.35), transparent 70%)" }}
      />
      <div className="rounded-2xl border border-[#1f2a23] bg-[#0f1310]/95 backdrop-blur p-5 md:p-7 shadow-2xl shadow-black/40">
        {/* «window controls» */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[#fb923c]" />
            <span className="size-2 rounded-full bg-[#a3e635]" />
            <span className="size-2 rounded-full bg-[#3b4a40]" />
            <span className="ml-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#7a8b80]">
              veloseller / live demo
            </span>
          </div>
          <span className="font-mono text-[10px] text-[#a3e635]/80 blink">LIVE</span>
        </div>

        {/* Заголовок мини-кейса */}
        <div className="flex items-baseline justify-between">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-widest text-[#7a8b80]">SKU · Кроссовки Nike Pegasus 41</div>
            <div className="mt-1 font-mono text-xs text-[#d4dcd6]">
              продано <span className="text-[#f4f7f3] tabular">60</span> шт за <span className="tabular">30</span> дней
            </div>
          </div>
        </div>

        {/* Sparkline */}
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-5 w-full h-[84px]" preserveAspectRatio="none">
          <defs>
            <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a3e635" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#a3e635" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* OOS-zone подсветка */}
          {(() => {
            const start = series.findIndex((v) => v === 0);
            const end = series.findLastIndex((v) => v === 0);
            if (start < 0 || end < 0) return null;
            const x1 = pad + start * stepX;
            const x2 = pad + end * stepX;
            return (
              <g>
                <rect x={x1} y={pad} width={Math.max(x2 - x1, 2)} height={H - pad * 2} fill="#fb923c" fillOpacity="0.08" />
                <text x={(x1 + x2) / 2} y={H - pad - 4} textAnchor="middle" className="font-mono"
                  fill="#fb923c" fontSize="9" letterSpacing="0.1em">OOS</text>
              </g>
            );
          })()}
          <path d={areaPath} fill="url(#grad)" />
          <path d={path} fill="none" stroke="#a3e635" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>

        {/* Слайдер OOS-дней */}
        <div className="mt-5">
          <div className="flex justify-between items-center mb-2">
            <label htmlFor="oos" className="font-mono text-[10px] uppercase tracking-widest text-[#7a8b80]">
              Дней без товара
            </label>
            <span className="font-mono text-sm text-[#fb923c] tabular">{oos} / 30 дней</span>
          </div>
          <input
            id="oos"
            type="range"
            min={0}
            max={20}
            value={oos}
            onChange={(e) => setOos(parseInt(e.target.value))}
            className="w-full accent-[#a3e635] cursor-pointer"
          />
        </div>

        {/* Сравнение */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-[#2a3830] bg-[#0a0d0a] p-4">
            <div className="font-mono text-[10px] uppercase tracking-widest text-[#7a8b80]">обычная velocity</div>
            <div className="mt-1 font-mono text-3xl text-[#7a8b80] tabular line-through decoration-[#fb923c]/60 decoration-2">
              {naive.toFixed(2)}
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-[#7a8b80]">шт / день</div>
          </div>
          <div className="rounded-lg border border-[#a3e635]/30 bg-[#a3e635]/[0.06] p-4 relative overflow-hidden">
            <div className="font-mono text-[10px] uppercase tracking-widest text-[#a3e635]">TVelo</div>
            <div className="mt-1 font-mono text-3xl text-[#d4ff5c] tabular">{tvelo.toFixed(2)}</div>
            <div className="mt-0.5 font-mono text-[10px] text-[#7a8b80]">
              шт / день · <span className="text-[#a3e635]">+{lift.toFixed(0)}%</span>
            </div>
          </div>
        </div>

        <p className="mt-5 text-[12.5px] leading-relaxed text-[#7a8b80]">
          Поделить продажи на 30 — это неправильно: <span className="text-[#fb923c]">{oos} дней</span> товара
          просто не было на складе. TVelo считает только дни <span className="text-[#a3e635]">когда товар был доступен</span>.
        </p>
      </div>
    </div>
  );
}
