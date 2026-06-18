import Link from "next/link";
import type { Metadata } from "next";
import { Eyebrow, MarketingHeader, MarketingFooter } from "../_components/MarketingChrome";

export const metadata: Metadata = {
  title: "Мобильное приложение",
  description:
    "Мобильное приложение Veloseller для iOS и Android — скоро. Остатки, скорость продаж и риск out-of-stock на телефоне, push о дозаказе. А пока — установите веб-версию.",
};

const CHIP: Record<string, string> = {
  lime: "text-lime-deep bg-lime-soft",
  azure: "text-azure bg-azure/10",
  emerald: "text-emerald bg-emerald/10",
  orange: "text-orange bg-orange/10",
};
const HOVER: Record<string, string> = {
  lime: "hover:border-lime-deep/40",
  azure: "hover:border-azure/40",
  emerald: "hover:border-emerald/40",
  orange: "hover:border-orange/40",
};
const ACCENTS = ["lime", "azure", "emerald", "orange"];

const FEATURES = [
  { title: "Дашборд на ходу", text: "Остатки, TVelo, дни покрытия и health score — всё под рукой, без ноутбука." },
  { title: "Push о дозаказе", text: "Уведомления: товар пора заказать, остаток упал, синхронизация сломалась." },
  { title: "Склады WB и Ozon", text: "Быстрый просмотр по складам Wildberries и Ozon FBO/FBS в одном окне." },
  { title: "Прогноз нехватки", text: "Сколько дней до нуля и сколько везти — расчёт в кармане." },
];

const PWA_STEPS = [
  { p: "iOS · Safari", text: "Кнопка «Поделиться» → добавить на главный экран." },
  { p: "Android · Chrome", text: "Меню браузера → «Установить приложение»." },
];

const BARS = [42, 68, 55, 80, 60, 92, 74];

export default function AppsPage() {
  return (
    <div className="relative min-h-screen bg-paper-warm text-ink overflow-x-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-noise opacity-100 mix-blend-multiply" />
      <div aria-hidden className="pointer-events-none fixed -top-40 -left-40 size-[700px] rounded-full blur-3xl opacity-50" style={{ background: "radial-gradient(closest-side, rgba(132,204,22,0.25), transparent 70%)" }} />
      <div aria-hidden className="pointer-events-none fixed -bottom-40 -right-40 size-[600px] rounded-full blur-3xl opacity-40" style={{ background: "radial-gradient(closest-side, rgba(2,132,199,0.15), transparent 70%)" }} />

      <MarketingHeader />

      <section className="relative px-6 py-16 md:py-20">
        <div className="max-w-4xl mx-auto text-center reveal">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-lime-deep/30 bg-lime-soft">
            <span className="size-1.5 rounded-full bg-lime-deep animate-pulse" />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime-deep font-semibold">Мобильное приложение · скоро</span>
          </span>
          <h1 className="mt-6 font-display text-3xl sm:text-4xl md:text-6xl tracking-tight font-medium leading-[1.05]">
            Veloseller в кармане.{" "}
            <span className="bg-gradient-to-r from-lime-deep to-azure bg-clip-text text-transparent">Скоро</span>{" "}
            на iOS и Android.
          </h1>
          <p className="mt-5 text-ink-muted text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Остатки, скорость продаж и риск out-of-stock — на телефоне. Push прилетит, как только товар пора дозаказать.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href={"/register" as any} className="rounded-lg bg-ink text-paper px-6 py-3 text-sm font-semibold hover:bg-ink-soft transition shadow-[0_10px_30px_-10px_rgba(10,10,8,0.45)] hover:-translate-y-0.5">
              Получить ранний доступ
            </Link>
            <a href="#pwa" className="rounded-lg bg-paper text-ink border border-line px-6 py-3 text-sm font-semibold hover:border-lime-deep/40 transition hover:-translate-y-0.5">
              Установить веб-версию
            </a>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-xl border border-line bg-paper px-4 py-2.5 text-sm shadow-sm">
              <span className="size-1.5 rounded-full bg-lime-deep animate-pulse" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-hush">скоро</span>
              <span className="font-medium">App Store</span>
            </span>
            <span className="inline-flex items-center gap-2 rounded-xl border border-line bg-paper px-4 py-2.5 text-sm shadow-sm">
              <span className="size-1.5 rounded-full bg-azure animate-pulse" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-hush">скоро</span>
              <span className="font-medium">Google Play</span>
            </span>
          </div>

          <div className="reveal mt-12 flex justify-center" style={{ animationDelay: "150ms" }}>
            <div className="relative w-[260px] rounded-[2.2rem] border border-line bg-paper p-3 shadow-2xl">
              <div className="rounded-[1.6rem] bg-gradient-to-b from-bg-soft to-paper overflow-hidden text-left">
                <div className="px-4 pt-4 pb-3 flex items-center justify-between">
                  <span className="font-display text-sm font-medium">Velo<span className="text-lime-deep">seller</span></span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-lime-deep animate-pulse" />
                    <span className="font-mono text-[9px] text-ink-hush uppercase">live</span>
                  </span>
                </div>
                <div className="px-4 pb-5 space-y-2.5">
                  <div className="rounded-xl bg-lime-soft p-3">
                    <div className="font-mono text-[9px] text-lime-deep uppercase tracking-wider">дней до нуля</div>
                    <div className="font-display text-2xl font-medium text-lime-deep tabular">12</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl border border-line p-3">
                      <div className="font-mono text-[9px] text-ink-hush uppercase">остаток</div>
                      <div className="font-display text-lg font-medium tabular">842</div>
                    </div>
                    <div className="rounded-xl border border-line p-3">
                      <div className="font-mono text-[9px] text-ink-hush uppercase">скорость</div>
                      <div className="font-display text-lg font-medium tabular text-azure">68/д</div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-line p-3">
                    <div className="font-mono text-[9px] text-ink-hush uppercase">продажи · 7 дней</div>
                    <div className="mt-2 flex items-end gap-1 h-10">
                      {BARS.map((h, i) => (
                        <span key={i} className="flex-1 rounded-sm bg-gradient-to-t from-lime-deep/40 to-lime-deep" style={{ height: h + "%" }} />
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg bg-ink text-paper text-center py-2 text-xs font-semibold">Дозаказать 1 200 шт</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative px-6 py-12 md:py-16 border-t border-line">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10 reveal">
            <Eyebrow>Что будет в приложении</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-4xl tracking-tight font-medium">
              Аналитика остатков всегда с собой
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {FEATURES.map((f, i) => {
              const a = ACCENTS[i % 4];
              return (
                <div key={f.title} className={"group reveal rounded-2xl border border-line bg-paper p-6 transition hover:-translate-y-1 hover:shadow-xl " + HOVER[a]} style={{ animationDelay: i * 80 + "ms" }}>
                  <div className={"flex size-11 items-center justify-center rounded-xl font-mono text-sm font-semibold transition group-hover:scale-110 " + CHIP[a]}>{String(i + 1).padStart(2, "0")}</div>
                  <h3 className="mt-5 font-display text-lg leading-tight font-medium">{f.title}</h3>
                  <p className="mt-2 text-sm text-ink-muted leading-relaxed">{f.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="pwa" className="relative px-6 py-12 md:py-16 border-t border-line bg-bg-soft">
        <div className="max-w-3xl mx-auto text-center">
          <div className="reveal">
            <Eyebrow>Уже сейчас</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-4xl tracking-tight font-medium">
              Установите веб-версию на телефон
            </h2>
            <p className="mt-3 text-ink-muted max-w-2xl mx-auto text-sm md:text-base leading-relaxed">
              Veloseller открывается как приложение прямо из браузера — иконка на экране, полный экран, без магазинов.
            </p>
          </div>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PWA_STEPS.map((s, i) => {
              const a = ACCENTS[i % 4];
              return (
                <div key={s.p} className={"reveal rounded-2xl border border-line bg-paper p-6 text-left transition hover:-translate-y-1 hover:shadow-xl " + HOVER[a]} style={{ animationDelay: i * 90 + "ms" }}>
                  <div className={"inline-flex rounded-lg px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider " + CHIP[a]}>{s.p}</div>
                  <p className="mt-3 text-sm text-ink-soft leading-relaxed">{s.text}</p>
                </div>
              );
            })}
          </div>
          <Link href={"/dashboard" as any} className="mt-8 inline-flex rounded-lg bg-ink text-paper px-6 py-3 text-sm font-semibold hover:bg-ink-soft transition shadow-[0_10px_30px_-10px_rgba(10,10,8,0.45)] hover:-translate-y-0.5">
            Открыть веб-версию
          </Link>
        </div>
      </section>

      <section className="relative px-6 py-16 md:py-24 border-t border-line">
        <div className="max-w-3xl mx-auto text-center reveal">
          <h2 className="font-display text-3xl md:text-5xl tracking-tight font-medium leading-tight">
            Будьте первыми{" "}
            <span className="bg-gradient-to-r from-lime-deep to-azure bg-clip-text text-transparent">в бете</span>
          </h2>
          <p className="mt-4 text-ink-muted text-base md:text-lg leading-relaxed">
            Создайте аккаунт — дадим ранний доступ к мобильной бете и сообщим о релизе в сторах.
          </p>
          <div className="mt-8">
            <Link href={"/register" as any} className="rounded-lg bg-ink text-paper px-6 py-3 text-sm font-semibold hover:bg-ink-soft transition shadow-[0_10px_30px_-10px_rgba(10,10,8,0.45)] hover:-translate-y-0.5">
              Получить ранний доступ
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
