"use client";
import { useState } from "react";
import { Icons } from "./_components/Icons";

const items = [
  { q: "Сколько по времени занимает подключение?", a: "5-10 минут. Для Google Sheet вставить ссылку. Для Ozon/WB выдать read-only API ключ в личном кабинете маркетплейса. Один Ozon-ключ может питать сразу два склада — Ozon FBO (остатки на складах маркетплейса) и Ozon FBS (ваш склад)." },
  { q: "Через сколько будет видна польза?",        a: "Первый сводный отчёт через 30 минут. Для точных прогнозов нужно минимум 7 дней истории — так алгоритм выявляет паттерны продаж. Наибольшая достоверность данных после 30 дней." },
  { q: "Что если у меня несколько складов на разных маркетплейсах?", a: "Подключите каждый склад отдельно — Ozon FBO, Ozon FBS, Wildberries FBO. Данные считаются раздельно и не смешиваются. Старт даёт 2 склада, Рост — 6, Про — 15." },
  { q: "Нужно ли выдавать вам доступ на изменение данных?", a: "Нет. Исключительно read-only — мы читаем остатки и продажи, ничего не записываем. Даже если ключ забудете у нас — никто не сможет изменить ваш каталог или цены." },
  { q: "Чем TVelo лучше обычного расчёта скорости продаж в Excel?", a: "Обычный подход sales/days — неверно, если товар не был на складе часть периода. TVelo = sales / in_stock_days. Разница может очень сильно влиять на расчёт закупки и других показателей склада." },
  { q: "Есть ли триал? Каждая ли тарифная опция бесплатна?", a: "Да — 30 дней любого плана, 15 складов как на Pro. Карта не требуется. Если не подошло — просто перестаёшь пользоваться." },
];

export default function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y divide-line border-y border-line">
      {items.map((it, i) => (
        <button
          key={i}
          onClick={() => setOpen(open === i ? null : i)}
          className="w-full text-left py-5 md:py-6 px-1 group hover:bg-bg-soft/50 transition"
        >
          <div className="flex items-start justify-between gap-4 md:gap-6">
            <div className="flex-1">
              <span className="font-mono text-[10px] text-ink-hush tabular tracking-widest">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-1 font-display text-lg md:text-xl text-ink leading-tight font-medium">{it.q}</h3>
              <div className={`grid transition-all duration-300 ${open === i ? "grid-rows-[1fr] mt-3 opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <p className="overflow-hidden text-ink-muted leading-relaxed text-sm md:text-base">{it.a}</p>
              </div>
            </div>
            <span className={`shrink-0 size-8 md:size-9 rounded-full border border-line-2 flex items-center justify-center transition-transform ${open === i ? "rotate-45 bg-lime-deep border-lime-deep text-paper" : "text-ink-soft group-hover:border-lime-deep/50"}`}>
              <Icons.Plus />
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
