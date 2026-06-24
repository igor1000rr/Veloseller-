"use client";
import { useState } from "react";

// Калькулятор юнит-экономики SKU: прибыль с единицы после комиссии, логистики
// и себестоимости + маржинальность и наценка. Ползунки → пересчёт онлайн.
const ru = (n: number) => Math.round(n).toLocaleString("ru-RU");

export default function UnitEconomicsCalculator() {
  const [price, setPrice] = useState(1500);
  const [cost, setCost] = useState(600);
  const [commission, setCommission] = useState(17);
  const [logistics, setLogistics] = useState(120);

  const commissionRub = (price * commission) / 100;
  const profit = price - cost - commissionRub - logistics;
  const marginPct = price > 0 ? (profit / price) * 100 : 0;
  const markupPct = cost > 0 ? ((price - cost) / cost) * 100 : 0;
  const positive = profit >= 0;

  return (
    <div className="rounded-2xl border border-line bg-paper p-6 md:p-8 shadow-sm">
      <div className="grid md:grid-cols-2 gap-8 items-center">
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink-soft">Цена продажи, ₽</span>
              <span className="font-mono text-xl font-semibold text-lime-deep tabular">{ru(price)}</span>
            </div>
            <input type="range" min={100} max={10000} step={50} value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              className="mt-3 w-full accent-lime-deep cursor-pointer" aria-label="Цена продажи" />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-hush"><span>100 ₽</span><span>10 000 ₽</span></div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink-soft">Себестоимость, ₽</span>
              <span className="font-mono text-xl font-semibold text-azure tabular">{ru(cost)}</span>
            </div>
            <input type="range" min={0} max={10000} step={50} value={cost}
              onChange={(e) => setCost(Number(e.target.value))}
              className="mt-3 w-full accent-azure cursor-pointer" aria-label="Себестоимость" />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-hush"><span>0 ₽</span><span>10 000 ₽</span></div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink-soft">Комиссия маркетплейса, %</span>
              <span className="font-mono text-xl font-semibold text-orange tabular">{commission}%</span>
            </div>
            <input type="range" min={0} max={40} value={commission}
              onChange={(e) => setCommission(Number(e.target.value))}
              className="mt-3 w-full accent-orange cursor-pointer" aria-label="Комиссия маркетплейса" />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-hush"><span>0%</span><span>40%</span></div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink-soft">Логистика, хранение и пр., ₽/шт</span>
              <span className="font-mono text-xl font-semibold text-emerald tabular">{ru(logistics)}</span>
            </div>
            <input type="range" min={0} max={2000} step={10} value={logistics}
              onChange={(e) => setLogistics(Number(e.target.value))}
              className="mt-3 w-full accent-emerald cursor-pointer" aria-label="Логистика и прочие расходы" />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-hush"><span>0 ₽</span><span>2 000 ₽</span></div>
          </div>
        </div>

        <div className={`rounded-xl border border-line p-6 text-center bg-gradient-to-br ${positive ? "from-lime-soft to-emerald/10" : "from-orange/10 to-rose/10"}`}>
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-hush">прибыль с единицы</div>
          <div className={`mt-2 font-display text-4xl md:text-5xl font-medium tabular bg-clip-text text-transparent bg-gradient-to-r ${positive ? "from-lime-deep to-emerald" : "from-orange to-rose"}`}>
            {profit >= 0 ? "" : "−"}{ru(Math.abs(profit))} ₽
          </div>
          <div className="mt-5 pt-5 border-t border-line/70 grid grid-cols-2 gap-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-ink-hush">маржинальность</div>
              <div className="mt-1 font-display text-xl font-medium tabular text-ink">{marginPct.toFixed(1)}%</div>
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-ink-hush">наценка</div>
              <div className="mt-1 font-display text-xl font-medium tabular text-ink">{markupPct.toFixed(0)}%</div>
            </div>
          </div>
          <div className="mt-4 text-xs text-ink-muted">
            {positive ? "Товар прибыльный — есть запас на рекламу" : "Минус: пересмотрите цену или расходы"}
          </div>
        </div>
      </div>
    </div>
  );
}
