"use client";
import { useState } from "react";

// Интерактивный калькулятор партнёрского дохода. Ползунки → пересчёт в реальном
// времени. SHARE синхронен с константой на странице (20%).
const SHARE = 0.2;

const ru = (n: number) => Math.round(n).toLocaleString("ru-RU");

export default function PartnerCalculator() {
  const [clients, setClients] = useState(15);
  const [arpu, setArpu] = useState(2500);

  const monthly = clients * arpu * SHARE;
  const yearly = monthly * 12;

  return (
    <div className="rounded-2xl border border-line bg-paper p-6 md:p-8 shadow-sm">
      <div className="grid md:grid-cols-2 gap-8 items-center">
        <div className="space-y-7">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink-soft">Клиентов приведено</span>
              <span className="font-mono text-xl font-semibold text-lime-deep tabular">{clients}</span>
            </div>
            <input
              type="range"
              min={1}
              max={100}
              value={clients}
              onChange={(e) => setClients(Number(e.target.value))}
              className="mt-3 w-full accent-lime-deep cursor-pointer"
              aria-label="Клиентов приведено"
            />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-hush">
              <span>1</span>
              <span>100</span>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink-soft">Средний чек клиента, ₽/мес</span>
              <span className="font-mono text-xl font-semibold text-azure tabular">{ru(arpu)}</span>
            </div>
            <input
              type="range"
              min={990}
              max={9990}
              step={100}
              value={arpu}
              onChange={(e) => setArpu(Number(e.target.value))}
              className="mt-3 w-full accent-azure cursor-pointer"
              aria-label="Средний чек клиента"
            />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-hush">
              <span>990 ₽</span>
              <span>9 990 ₽</span>
            </div>
          </div>
          <p className="font-mono text-xs text-ink-hush">Ваша доля — 20% с каждого платежа, пожизненно.</p>
        </div>

        <div className="rounded-xl bg-gradient-to-br from-lime-soft to-azure/10 border border-line p-6 text-center">
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-hush">ваш доход в месяц</div>
          <div className="mt-2 font-display text-4xl md:text-5xl font-medium tabular bg-gradient-to-r from-lime-deep to-azure bg-clip-text text-transparent">
            {ru(monthly)} ₽
          </div>
          <div className="mt-5 pt-5 border-t border-line/70">
            <div className="font-mono text-[11px] uppercase tracking-wider text-ink-hush">за год</div>
            <div className="mt-1 font-display text-2xl font-medium tabular text-ink">{ru(yearly)} ₽</div>
          </div>
          <div className="mt-3 text-xs text-ink-muted">и это повторяется каждый месяц</div>
        </div>
      </div>
    </div>
  );
}
