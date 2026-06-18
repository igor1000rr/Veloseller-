import Link from "next/link";
import type { Metadata } from "next";
import { Eyebrow, MarketingHeader, MarketingFooter } from "../_components/MarketingChrome";

export const metadata: Metadata = {
  title: "Мобильное приложение",
  description:
    "Мобильное приложение Veloseller для iOS и Android — скоро. Остатки, скорость продаж и риск out-of-stock на телефоне, push о дозаказе. А пока — установите веб-версию.",
};

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

export default function AppsPage() {
  return (
    <div className="relative min-h-screen bg-paper-warm text-ink overflow-x-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-noise opacity-100 mix-blend-multiply" />
      <MarketingHeader />

      <section className="relative px-6 py-16 md:py-24">
        <div className="max-w-4xl mx-auto text-center">
          <Eyebrow>Мобильное приложение · скоро</Eyebrow>
          <h1 className="mt-4 font-display text-3xl sm:text-4xl md:text-6xl tracking-tight font-medium leading-[1.05]">
            Veloseller в кармане. Скоро на iOS и Android.
          </h1>
          <p className="mt-5 text-ink-muted text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Остатки, скорость продаж и риск out-of-stock — на телефоне. Push прилетит, как только товар пора дозаказать.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href={"/register" as any} className="rounded-lg bg-ink text-paper px-6 py-3 text-sm font-semibold hover:bg-ink-soft transition">
              Получить ранний доступ
            </Link>
            <a href="#pwa" className="rounded-lg bg-bg-soft text-ink border border-line px-6 py-3 text-sm font-semibold hover:border-lime-deep/40 transition">
              Установить веб-версию
            </a>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-lg border border-line bg-paper px-4 py-2 text-sm text-ink-muted">
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-hush">скоро</span> App Store
            </span>
            <span className="inline-flex items-center gap-2 rounded-lg border border-line bg-paper px-4 py-2 text-sm text-ink-muted">
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-hush">скоро</span> Google Play
            </span>
          </div>
        </div>
      </section>

      <section className="px-6 py-12 md:py-16 border-t border-line">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <Eyebrow>Что будет в приложении</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-4xl tracking-tight font-medium">
              Аналитика остатков всегда с собой
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-line bg-paper p-6 hover:border-lime-deep/40 hover:shadow-lg transition">
                <h3 className="font-display text-lg leading-tight font-medium">{f.title}</h3>
                <p className="mt-2 text-sm text-ink-muted leading-relaxed">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pwa" className="px-6 py-12 md:py-16 border-t border-line bg-bg-soft">
        <div className="max-w-3xl mx-auto text-center">
          <Eyebrow>Уже сейчас</Eyebrow>
          <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-4xl tracking-tight font-medium">
            Установите веб-версию на телефон
          </h2>
          <p className="mt-3 text-ink-muted max-w-2xl mx-auto text-sm md:text-base leading-relaxed">
            Veloseller открывается как приложение прямо из браузера — иконка на экране, полный экран, без магазинов.
          </p>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PWA_STEPS.map((s) => (
              <div key={s.p} className="rounded-2xl border border-line bg-paper p-6 text-left">
                <div className="font-mono text-[10px] uppercase tracking-wider text-lime-deep">{s.p}</div>
                <p className="mt-2 text-sm text-ink-soft leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
          <Link href={"/dashboard" as any} className="mt-8 inline-flex rounded-lg bg-ink text-paper px-6 py-3 text-sm font-semibold hover:bg-ink-soft transition">
            Открыть веб-версию
          </Link>
        </div>
      </section>

      <section className="px-6 py-16 md:py-24 border-t border-line">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-display text-3xl md:text-5xl tracking-tight font-medium leading-tight">
            Будьте первыми в бете
          </h2>
          <p className="mt-4 text-ink-muted text-base md:text-lg leading-relaxed">
            Создайте аккаунт — дадим ранний доступ к мобильной бете и сообщим о релизе в сторах.
          </p>
          <div className="mt-8">
            <Link href={"/register" as any} className="rounded-lg bg-ink text-paper px-6 py-3 text-sm font-semibold hover:bg-ink-soft transition">
              Получить ранний доступ
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
