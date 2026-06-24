"use client";
import { useState } from "react";

// Интерактивный калькулятор потерянной выручки из-за out-of-stock.
// Ползунки → пересчёт в реальном времени. Лид-магнит: показывает «цену нуля»
// и ведёт на регистрацию. Формула проста и прозрачна (см. блок на странице):
//   потерянные продажи = продажи/день × дни без остатка
//   потерянная выручка  = потерянные продажи × цена
const ru = (n: number) => Math.round(n).toLocaleString("ru-RU");

export default function LostRevenueCalculator() {
  const [salesPerDay, setSalesPerDay] = useState(10);
  const [price, setPrice] = useState(1500);
  const [oosDays, setOosDays] = useState(7);

  const lostUnits = salesPerDay * oosDays;
  const lostMonth = lostUnits * price;
  const lostYear = lostMonth * 12;
  const potentialMonth = salesPerDay * 30 * price;
  const lostPct = potentialMonth > 0 ? Math.round((lostMonth / potentialMonth) * 100) : 0;

  return (
    <div className="rounded-2xl border border-line bg-paper p-6 md:p-8 shadow-sm">
      <div className="grid md:grid-cols-2 gap-8 items-center">
        <div className="space-y-7">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink-soft">Продаёте в день (когда в наличии), шт</span>
              <span className="font-mono text-xl font-semibold text-lime-deep tabular">{salesPerDay}</span>
            </div>
            <input
              type="range"
              min={1}
              max={100}
              value={salesPerDay}
              onChange={(e) => setSalesPerDay(Number(e.target.value))}
              className="mt-3 w-full accent-lime-deep cursor-pointer"
              aria-label="Продаж в день"
            />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-hush">
              <span>1</span>
              <span>100</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink-soft">Цена за единицу, ₽</span>
              <span className="font-mono text-xl font-semibold text-azure tabular">{ru(price)}</span>
            </div>
            <input
              type="range"
              min={100}
              max={10000}
              step={50}
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              className="mt-3 w-full accent-azure cursor-pointer"
              aria-label="Цена за единицу"
            />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-hush">
              <span>100 ₽</span>
              <span>10 000 ₽</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink-soft">Дней без остатка за месяц</span>
              <span className="font-mono text-xl font-semibold text-orange tabular">{oosDays}</span>
            </div>
            <input
              type="range"
              min={0}
              max={30}
              value={oosDays}
              onChange={(e) => setOosDays(Number(e.target.value))}
              className="mt-3 w-full accent-orange cursor-pointer"
              aria-label="Дней без остатка за месяц"
            />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-hush">
              <span>0</span>
              <span>30</span>
            </div>
          </div>

          <p className="font-mono text-xs text-ink-hush">
            Это упущенная выручка: спрос был, но товара не было. В кабинете маркетплейса она не видна.
          </p>
        </div>

        <div className="rounded-xl bg-gradient-to-br from-orange/10 to-rose/10 border border-line p-6 text-center">
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-hush">потеряно за месяц</div>
          <div className="mt-2 font-display text-4xl md:text-5xl font-medium tabular bg-gradient-to-r from-orange to-rose bg-clip-text text-transparent">
            {ru(lostMonth)} ₽
          </div>
          <div className="mt-5 pt-5 border-t border-line/70 grid grid-cols-2 gap-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-ink-hush">за год</div>
              <div className="mt-1 font-display text-xl font-medium tabular text-ink">{ru(lostYear)} ₽</div>
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-ink-hush">потенциала</div>
              <div className="mt-1 font-display text-xl font-medium tabular text-ink">{lostPct}%</div>
            </div>
          </div>
          <div className="mt-4 text-xs text-ink-muted">
            Недопродано <span className="font-semibold text-ink-soft">{ru(lostUnits)} шт</span> за месяц
          </div>
        </div>
      </div>
    </div>
  );
}
