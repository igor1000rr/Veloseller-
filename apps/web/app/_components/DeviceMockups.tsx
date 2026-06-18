import type { ReactNode } from "react";

// Рамка iPhone + примеры экранов приложения (статичные «скриншоты», нарисованы
// на div-ах в фирменных токенах). Используются в галерее и фиче-блоках /apps.

export function PhoneFrame({ children, widthClass = "w-[250px]", className = "" }: { children: ReactNode; widthClass?: string; className?: string }) {
  return (
    <div className={"relative mx-auto " + widthClass + " " + className}>
      <div className="rounded-[2.6rem] bg-ink p-[7px] shadow-2xl ring-1 ring-black/5">
        <div className="relative overflow-hidden rounded-[2.1rem] bg-paper" style={{ aspectRatio: "9 / 19.5" }}>
          <div className="absolute left-1/2 top-[10px] z-20 h-[18px] w-[76px] -translate-x-1/2 rounded-full bg-ink" />
          <div className="relative z-10 flex items-center justify-between px-6 pt-3 text-[10px] font-mono font-semibold text-ink">
            <span>9:41</span>
            <span className="flex items-center gap-[3px]">
              <span className="inline-block h-2 w-[3px] rounded-sm bg-ink" />
              <span className="inline-block h-2.5 w-[3px] rounded-sm bg-ink" />
              <span className="inline-block h-2 w-4 rounded-[3px] border border-ink" />
            </span>
          </div>
          <div className="px-3 pb-5 pt-2">{children}</div>
          <div className="absolute bottom-1.5 left-1/2 h-1 w-24 -translate-x-1/2 rounded-full bg-ink/25" />
        </div>
      </div>
    </div>
  );
}

const SPARK = [40, 62, 55, 78, 60, 90, 72];

export function ScreenDashboard() {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <span className="font-display text-sm font-medium">Velo<span className="text-lime-deep">seller</span></span>
        <span className="size-7 rounded-full bg-bg-soft" />
      </div>
      <div className="rounded-2xl bg-gradient-to-br from-lime-deep to-emerald p-4 text-paper">
        <div className="font-mono text-[9px] uppercase tracking-wider opacity-80">health score</div>
        <div className="mt-1 flex items-end gap-2">
          <span className="font-display text-4xl font-medium leading-none">82</span>
          <span className="text-xs opacity-80 mb-1">/ 100 · хорошо</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-line p-3">
          <div className="font-mono text-[8px] uppercase text-ink-hush">TVelo</div>
          <div className="font-display text-lg font-medium tabular">68<span className="text-xs text-ink-muted"> /д</span></div>
        </div>
        <div className="rounded-xl border border-line p-3">
          <div className="font-mono text-[8px] uppercase text-ink-hush">дни покрытия</div>
          <div className="font-display text-lg font-medium tabular text-azure">12</div>
        </div>
      </div>
      <div className="rounded-xl border border-line p-3">
        <div className="font-mono text-[8px] uppercase text-ink-hush">продажи · 7 дней</div>
        <div className="mt-2 flex items-end gap-1 h-12">
          {SPARK.map((h, i) => (
            <span key={i} className="flex-1 rounded-sm bg-gradient-to-t from-lime-deep/40 to-lime-deep" style={{ height: h + "%" }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ScreenPush() {
  return (
    <div className="-mx-3 -mt-2 -mb-5">
      <div className="min-h-[470px] bg-gradient-to-b from-azure/20 via-lime-soft to-paper px-4 pt-5 pb-10">
        <div className="text-center text-ink">
          <div className="font-mono text-[11px]">пятница, 18 июня</div>
          <div className="font-display text-5xl font-medium leading-none mt-1">9:41</div>
        </div>
        <div className="mt-10 space-y-2.5">
          <div className="rounded-2xl bg-paper/90 p-3 shadow-md">
            <div className="flex items-center gap-2">
              <span className="size-5 rounded-md bg-lime-deep" />
              <span className="font-mono text-[9px] uppercase tracking-wider text-ink-hush">Veloseller · сейчас</span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink">
              <span className="size-1.5 rounded-full bg-orange" /> SKU-1024: 5 дней до нуля
            </div>
            <div className="text-[11px] text-ink-muted leading-snug">Пора дозаказать — рекомендуем 1 200 шт.</div>
          </div>
          <div className="rounded-2xl bg-paper/90 p-3 shadow-md">
            <div className="flex items-center gap-2">
              <span className="size-5 rounded-md bg-azure" />
              <span className="font-mono text-[9px] uppercase tracking-wider text-ink-hush">Veloseller · 2 ч назад</span>
            </div>
            <div className="mt-1.5 text-xs font-semibold text-ink">Остаток на WB упал ниже минимума</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const WH = [
  { n: "Коледино", v: "842", dot: "bg-lime-deep" },
  { n: "Электросталь", v: "56", dot: "bg-orange" },
  { n: "Казань", v: "0", dot: "bg-rose" },
  { n: "Краснодар", v: "318", dot: "bg-lime-deep" },
];

export function ScreenWarehouses() {
  return (
    <div className="space-y-2.5">
      <div className="px-1 font-display text-sm font-medium">Склады</div>
      <div className="flex gap-1 rounded-lg bg-bg-soft p-1 text-[9px]">
        <span className="flex-1 rounded-md bg-paper py-1 text-center font-medium shadow-sm">Wildberries</span>
        <span className="flex-1 py-1 text-center text-ink-muted">Ozon FBO</span>
        <span className="flex-1 py-1 text-center text-ink-muted">FBS</span>
      </div>
      {WH.map((w) => (
        <div key={w.n} className="flex items-center justify-between rounded-xl border border-line p-3">
          <div className="flex items-center gap-2">
            <span className={"size-2 rounded-full " + w.dot} />
            <span className="text-xs">{w.n}</span>
          </div>
          <span className="font-display text-sm font-medium tabular">{w.v}</span>
        </div>
      ))}
    </div>
  );
}

export function ScreenForecast() {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 px-1">
        <span className="text-ink-muted">‹</span>
        <span className="font-display text-sm font-medium">SKU-1024</span>
      </div>
      <div className="rounded-2xl border border-line p-3">
        <div className="font-mono text-[8px] uppercase text-ink-hush">прогноз остатка</div>
        <svg viewBox="0 0 200 80" className="mt-2 w-full">
          <polyline points="0,14 40,27 80,40 120,54 160,67 196,78" fill="none" stroke="currentColor" className="text-azure" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="196" cy="78" r="3.5" fill="currentColor" className="text-rose" />
        </svg>
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-mono text-ink-hush">сегодня</span>
          <span className="font-mono text-rose">0 через 12 дней</span>
        </div>
      </div>
      <div className="rounded-2xl bg-lime-soft p-3 text-lime-deep">
        <div className="font-mono text-[8px] uppercase tracking-wider">рекомендуем заказать</div>
        <div className="font-display text-2xl font-medium tabular">1 200 шт</div>
      </div>
      <div className="rounded-xl bg-ink text-paper py-2.5 text-center text-xs font-semibold">Создать поставку</div>
    </div>
  );
}

const HOME_ICONS = ["bg-rose/70", "bg-azure/70", "bg-orange/70", "bg-emerald/70", "bg-ink/50", "bg-lime-deep/70", "bg-azure/50"];

export function ScreenHome() {
  return (
    <div className="-mx-3 -mt-2 -mb-5">
      <div className="flex min-h-[470px] flex-col bg-gradient-to-b from-azure/25 via-lime-soft to-emerald/20 px-5 pt-6 pb-8">
        <div className="text-center text-ink/80">
          <div className="font-display text-4xl font-medium leading-none">9:41</div>
          <div className="mt-1 font-mono text-[11px]">четверг, 18 июня</div>
        </div>
        <div className="mt-9 grid grid-cols-4 gap-x-4 gap-y-5">
          {HOME_ICONS.map((c, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <span className={"size-11 rounded-[14px] shadow-sm " + c} />
              <span className="h-1.5 w-7 rounded-full bg-paper/50" />
            </div>
          ))}
          <div className="flex flex-col items-center gap-1.5">
            <span className="flex size-11 items-center justify-center rounded-[14px] bg-gradient-to-br from-lime-deep to-emerald shadow-lg ring-2 ring-paper">
              <span className="font-display text-base font-semibold text-paper">V</span>
            </span>
            <span className="font-mono text-[8px] text-ink/70">Veloseller</span>
          </div>
        </div>
        <div className="mx-auto mt-7 flex w-fit items-center gap-1.5 rounded-full bg-paper/85 px-3 py-1.5 shadow-sm">
          <span className="size-1.5 rounded-full bg-lime-deep" />
          <span className="font-mono text-[9px] text-ink-soft">добавлено на экран «Домой»</span>
        </div>
        <div className="mt-auto rounded-[26px] bg-paper/35 p-2.5">
          <div className="flex justify-around">
            {["bg-azure/70", "bg-emerald/70", "bg-orange/70", "bg-rose/70"].map((c, i) => (
              <span key={i} className={"size-10 rounded-[13px] shadow-sm " + c} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
