"use client";
import { useEffect, useRef, useState } from "react";

// Анимированный мокап партнёрского кабинета: счётчики считаются вверх,
// столбики дохода растут при появлении, бейдж «20%» плавает.
function useCountUp(target: number, duration = 1400) {
  const [v, setV] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

const ru = (n: number) => Math.round(n).toLocaleString("ru-RU");
const BARS = [28, 44, 38, 60, 72, 90];

export default function PartnerDashboard() {
  const clicks = useCountUp(1280);
  const signups = useCountUp(96);
  const payout = useCountUp(48000);
  const [grown, setGrown] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setGrown(true), 150);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative">
      <div className="relative rounded-2xl border border-line bg-paper shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-line bg-bg-soft">
          <span className="size-2.5 rounded-full bg-rose/70" />
          <span className="size-2.5 rounded-full bg-orange/70" />
          <span className="size-2.5 rounded-full bg-lime/70" />
          <span className="ml-3 font-mono text-[10px] text-ink-hush">partner.veloseller.ru</span>
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between">
            <span className="font-display text-sm font-medium">Партнёрский кабинет</span>
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-lime-deep animate-pulse" />
              <span className="font-mono text-[9px] uppercase text-ink-hush">онлайн</span>
            </span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2.5">
            <div className="rounded-xl bg-bg-soft p-3">
              <div className="font-mono text-[9px] uppercase tracking-wider text-ink-hush">клики</div>
              <div className="mt-1 font-display text-lg sm:text-xl font-medium tabular">{ru(clicks)}</div>
            </div>
            <div className="rounded-xl bg-bg-soft p-3">
              <div className="font-mono text-[9px] uppercase tracking-wider text-ink-hush">регистрации</div>
              <div className="mt-1 font-display text-lg sm:text-xl font-medium tabular text-azure">{ru(signups)}</div>
            </div>
            <div className="rounded-xl bg-lime-soft p-3">
              <div className="font-mono text-[9px] uppercase tracking-wider text-lime-deep">выплачено ₽</div>
              <div className="mt-1 font-display text-lg sm:text-xl font-medium tabular text-lime-deep">{ru(payout)}</div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-line p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase tracking-wider text-ink-hush">доход по месяцам</span>
              <span className="font-mono text-[10px] text-lime-deep">↑ растёт</span>
            </div>
            <div className="mt-3 flex items-end gap-2 h-24">
              {BARS.map((h, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-md bg-gradient-to-t from-lime-deep/30 to-lime-deep transition-all duration-1000 ease-out"
                  style={{ height: grown ? h + "%" : "4%", transitionDelay: i * 90 + "ms" }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -right-3 -top-4 rotate-6 rounded-2xl bg-ink text-paper px-4 py-2.5 shadow-xl float">
        <div className="font-mono text-[9px] uppercase tracking-wider opacity-70">ваша доля</div>
        <div className="font-display text-2xl font-medium leading-none">20%</div>
      </div>
    </div>
  );
}
