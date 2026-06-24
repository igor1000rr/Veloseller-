"use client";
import { useState } from "react";

// Калькулятор точки дозаказа и страхового запаса. Ползунки → пересчёт онлайн.
//   страховой запас = продажи/день × дни буфера
//   точка дозаказа  = продажи/день × срок поставки + страховой запас
const ru = (n: number) => Math.round(n).toLocaleString("ru-RU");

export default function ReorderPointCalculator() {
  const [salesPerDay, setSalesPerDay] = useState(10);
  const [leadTime, setLeadTime] = useState(20);
  const [safetyDays, setSafetyDays] = useState(7);

  const safetyStock = salesPerDay * safetyDays;
  const reorderPoint = salesPerDay * leadTime + safetyStock;
  const coverAtReorder = leadTime + safetyDays;

  return (
    <div className="rounded-2xl border border-line bg-paper p-6 md:p-8 shadow-sm">
      <div className="grid md:grid-cols-2 gap-8 items-center">
        <div className="space-y-7">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink-soft">Продаёте в день, шт</span>
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
              <span className="text-sm font-medium text-ink-soft">Срок поставки (lead time), дней</span>
              <span className="font-mono text-xl font-semibold text-azure tabular">{leadTime}</span>
            </div>
            <input
              type="range"
              min={1}
              max={90}
              value={leadTime}
              onChange={(e) => setLeadTime(Number(e.target.value))}
              className="mt-3 w-full accent-azure cursor-pointer"
              aria-label="Срок поставки в днях"
            />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-hush">
              <span>1</span>
              <span>90</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink-soft">Страховой буфер, дней</span>
              <span className="font-mono text-xl font-semibold text-emerald tabular">{safetyDays}</span>
            </div>
            <input
              type="range"
              min={0}
              max={30}
              value={safetyDays}
              onChange={(e) => setSafetyDays(Number(e.target.value))}
              className="mt-3 w-full accent-emerald cursor-pointer"
              aria-label="Страховой буфер в днях"
            />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-hush">
              <span>0</span>
              <span>30</span>
            </div>
          </div>

          <p className="font-mono text-xs text-ink-hush">
            Как только остаток упал до точки дозаказа — оформляйте поставку: новая партия успеет прийти до нуля.
          </p>
        </div>

        <div className="rounded-xl bg-gradient-to-br from-lime-soft to-emerald/10 border border-line p-6 text-center">
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-hush">точка дозаказа</div>
          <div className="mt-2 font-display text-4xl md:text-5xl font-medium tabular bg-gradient-to-r from-lime-deep to-emerald bg-clip-text text-transparent">
            {ru(reorderPoint)} шт
          </div>
          <div className="mt-5 pt-5 border-t border-line/70 grid grid-cols-2 gap-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-ink-hush">страховой запас</div>
              <div className="mt-1 font-display text-xl font-medium tabular text-ink">{ru(safetyStock)} шт</div>
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-ink-hush">покрытие</div>
              <div className="mt-1 font-display text-xl font-medium tabular text-ink">{coverAtReorder} дн</div>
            </div>
          </div>
          <div className="mt-4 text-xs text-ink-muted">
            Заказывайте при остатке <span className="font-semibold text-ink-soft">{ru(reorderPoint)} шт</span>
          </div>
        </div>
      </div>
    </div>
  );
}
