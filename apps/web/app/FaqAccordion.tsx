"use client";
import { useState } from "react";

const items = [
  {
    q: "Сколько по времени занимает подключение?",
    a: "5–10 минут. Для Google Sheet — вставить ссылку. Для Ozon/WB — выдать read-only API ключ в личном кабинете маркетплейса.",
  },
  {
    q: "Через сколько будет видна польза?",
    a: "Первые TVelo расчёты и health-score через 30 минут. Для точных прогнозов нужно 7 дней истории — так алгоритм выявляет паттерны продаж.",
  },
  {
    q: "Что если у меня несколько магазинов на разных маркетплейсах?",
    a: "Добавьте каждый как отдельный источник. Growth поддерживает до 3 магазинов, Pro — безлимит.",
  },
  {
    q: "Нужно ли выдавать вам доступ на изменение данных?",
    a: "Нет. Исключительно read-only — мы читаем остатки и продажи, ничего не записываем.",
  },
  {
    q: "Чем TVelo лучше обычной velocity из Excel?",
    a: "Обычный подход sales/days — это неправда, если товар не был в стоке часть периода. TVelo = sales/in_stock_days. Разница легко доходит до 50%.",
  },
  {
    q: "Есть ли триал?",
    a: "Да — 30 дней любого плана. Карта не требуется.",
  },
];

export default function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y divide-line border-y border-line">
      {items.map((it, i) => (
        <button
          key={i}
          onClick={() => setOpen(open === i ? null : i)}
          className="w-full text-left py-5 sm:py-6 px-2 group hover:bg-bg-soft/50 transition"
        >
          <div className="flex items-start justify-between gap-4 sm:gap-6">
            <div className="min-w-0 flex-1">
              <span className="font-mono text-[10px] text-ink-hush tabular tracking-widest">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-1 font-display text-lg sm:text-xl text-ink leading-snug">{it.q}</h3>
              <div className={`grid transition-all duration-300 ${open === i ? "grid-rows-[1fr] mt-3 opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <p className="overflow-hidden text-ink-muted leading-relaxed text-sm sm:text-base">{it.a}</p>
              </div>
            </div>
            <span className={`shrink-0 size-8 sm:size-9 rounded-full border border-line-2 flex items-center justify-center transition-transform ${open === i ? "rotate-45 bg-lime-deep border-lime-deep text-paper" : "text-ink-muted group-hover:border-lime-deep/50"}`}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
