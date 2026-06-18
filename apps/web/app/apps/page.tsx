import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { APP_PROMO_ENABLED } from "@/lib/features";
import LandingHeader from "../_landing/Header";
import LandingFooter from "../_landing/Footer";
import ScrollToTopButton from "../_components/ScrollToTopButton";
import AppsInstallTabs from "../_components/AppsInstallTabs";
import { MIcon } from "../_components/MarketingIcons";
import { PhoneFrame, ScreenDashboard, ScreenPush, ScreenWarehouses, ScreenForecast } from "../_components/DeviceMockups";
import { Eyebrow } from "../_landing/ui";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Мобильное приложение",
  description:
    "Мобильное приложение Veloseller для iOS и Android — скоро. Дашборд остатков, push о дозаказе, склады WB и Ozon, прогноз нехватки на телефоне. А пока — установите веб-версию.",
};

const HOVER: Record<string, string> = {
  lime: "hover:border-lime-deep/40",
  azure: "hover:border-azure/40",
  emerald: "hover:border-emerald/40",
  orange: "hover:border-orange/40",
};
const ACCENTS = ["lime", "azure", "emerald", "orange"];
const TILE: Record<string, string> = {
  lime: "bg-gradient-to-br from-lime-deep to-emerald",
  azure: "bg-gradient-to-br from-azure to-lime-deep",
  emerald: "bg-gradient-to-br from-emerald to-azure",
  orange: "bg-gradient-to-br from-orange to-rose",
};
const TINT: Record<string, string> = {
  lime: "from-paper to-lime-soft",
  azure: "from-paper to-azure/10",
  emerald: "from-paper to-emerald/10",
  orange: "from-paper to-orange/10",
};
const GLOW = [
  "radial-gradient(closest-side, rgba(132,204,22,0.35), transparent 70%)",
  "radial-gradient(closest-side, rgba(2,132,199,0.30), transparent 70%)",
  "radial-gradient(closest-side, rgba(6,95,70,0.26), transparent 70%)",
  "radial-gradient(closest-side, rgba(234,88,12,0.26), transparent 70%)",
];

const SCREEN: Record<string, ReactNode> = {
  dashboard: <ScreenDashboard />,
  push: <ScreenPush />,
  warehouses: <ScreenWarehouses />,
  forecast: <ScreenForecast />,
};

const GALLERY = [
  { screen: "dashboard", cap: "Дашборд: health score, TVelo, дни покрытия" },
  { screen: "push", cap: "Push о дозаказе прямо на экран блокировки" },
  { screen: "warehouses", cap: "Остатки по складам WB и Ozon FBO/FBS" },
  { screen: "forecast", cap: "Прогноз нехватки и рекомендация поставки" },
];

const ROWS = [
  {
    eyebrow: "Уведомления",
    title: "Push, когда товар пора дозаказать",
    text: "Не нужно заходить и проверять — приложение само напишет, когда остатка осталось на считанные дни.",
    points: ["Сигнал за N дней до нуля", "Падение остатка ниже минимума", "Ошибка синхронизации склада"],
    screen: "push",
    reverse: false,
  },
  {
    eyebrow: "Склады",
    title: "Все склады WB и Ozon в одном окне",
    text: "Wildberries, Ozon FBO и FBS — переключаетесь между маркетплейсами одним тапом, видите критичные остатки по цвету.",
    points: ["Wildberries, Ozon FBO/FBS", "Цветные статусы остатка", "Поиск по SKU и складу"],
    screen: "warehouses",
    reverse: true,
  },
  {
    eyebrow: "Прогноз",
    title: "Сколько дней до нуля и сколько везти",
    text: "TVelo учитывает дни без продаж из-за out-of-stock, поэтому прогноз честный, а не заниженный.",
    points: ["Дата выхода в ноль", "Рекомендованный объём поставки", "Создание поставки в один тап"],
    screen: "forecast",
    reverse: false,
  },
];

const FEATURES = [
  { icon: "dashboard", title: "Дашборд на ходу", text: "Остатки, TVelo, дни покрытия и health score — всё под рукой, без ноутбука." },
  { icon: "bell", title: "Push о дозаказе", text: "Уведомления: товар пора заказать, остаток упал, синхронизация сломалась." },
  { icon: "box", title: "Склады WB и Ozon", text: "Быстрый просмотр по складам Wildberries и Ozon FBO/FBS в одном окне." },
  { icon: "chart", title: "Прогноз нехватки", text: "Сколько дней до нуля и сколько везти — расчёт в кармане." },
];

const ROADMAP = [
  { q: "Сейчас", t: "Веб-версия и установка как PWA", done: true },
  { q: "Скоро", t: "Бета для iOS и Android", done: false },
  { q: "Дальше", t: "Push, виджеты, быстрые поставки", done: false },
  { q: "Потом", t: "Apple Watch и офлайн-режим", done: false },
];

export default async function AppsPage() {
  if (!APP_PROMO_ENABLED) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isAuthed = !!user;

  return (
    <main className="relative bg-paper-warm text-ink overflow-x-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-noise opacity-100 mix-blend-multiply" />
      <div aria-hidden className="pointer-events-none fixed -top-40 -left-40 size-[700px] rounded-full blur-3xl opacity-50 float" style={{ background: "radial-gradient(closest-side, rgba(132,204,22,0.28), transparent 70%)" }} />
      <div aria-hidden className="pointer-events-none fixed -bottom-40 -right-40 size-[600px] rounded-full blur-3xl opacity-40 float-slow" style={{ background: "radial-gradient(closest-side, rgba(2,132,199,0.18), transparent 70%)" }} />

      <LandingHeader isAuthed={isAuthed} />

      <section className="relative w-full px-4 md:px-8 lg:px-12 pt-12 pb-12 md:pt-20 md:pb-16">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-center max-w-[1600px] mx-auto">
          <div className="lg:col-span-7 reveal">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-lime-deep/30 bg-lime-soft">
              <span className="size-1.5 rounded-full bg-lime-deep animate-pulse" />
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime-deep font-semibold">Мобильное приложение · скоро</span>
            </span>
            <h1 className="mt-6 font-display text-4xl sm:text-5xl md:text-6xl xl:text-7xl tracking-tight font-medium leading-[0.98]">
              Veloseller в кармане.{" "}
              <span className="inline-block bg-gradient-to-r from-lime-deep to-azure bg-clip-text text-transparent italic pr-[0.16em] leading-[1.1]">Скоро</span>{" "}
              на iOS и Android.
            </h1>
            <p className="mt-6 text-ink-muted text-base md:text-lg max-w-xl leading-relaxed">
              Остатки, скорость продаж и риск out-of-stock — на телефоне. Push прилетит, как только товар пора дозаказать.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href={"/register" as any} className="rounded-lg bg-ink text-paper px-6 py-3.5 text-sm font-semibold hover:bg-ink-soft transition shadow-[0_10px_30px_-10px_rgba(10,10,8,0.45)] hover:-translate-y-0.5">
                Получить ранний доступ
              </Link>
              <a href="#pwa" className="rounded-lg bg-paper text-ink border border-line px-6 py-3.5 text-sm font-semibold hover:border-lime-deep/40 transition hover:-translate-y-0.5">
                Установить веб-версию
              </a>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3">
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
          </div>
          <div className="lg:col-span-5 reveal" style={{ animationDelay: "140ms" }}>
            <div className="relative">
              <div aria-hidden className="pointer-events-none absolute inset-0 blur-3xl opacity-60" style={{ background: GLOW[0] }} />
              <div className="relative float-slow">
                <PhoneFrame widthClass="w-[260px]"><ScreenDashboard /></PhoneFrame>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative w-full px-4 md:px-8 lg:px-12 py-12 md:py-16 border-t border-line bg-bg-soft">
        <div className="max-w-[1600px] mx-auto">
          <div className="text-center mb-10 md:mb-14 reveal">
            <Eyebrow center>Как выглядит приложение</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-5xl tracking-tight font-medium">
              Загляните внутрь
            </h2>
            <p className="mt-4 text-ink-muted max-w-2xl mx-auto text-sm md:text-base">
              Примерные экраны — так аналитика остатков будет выглядеть в телефоне.
            </p>
          </div>
          <div className="flex gap-6 md:gap-8 overflow-x-auto px-1 pt-10 pb-6 lg:justify-center snap-x">
            {GALLERY.map((g, i) => (
              <div key={g.screen} className="reveal shrink-0 snap-center w-[210px]" style={{ animationDelay: i * 90 + "ms" }}>
                <div className={i % 2 === 1 ? "float" : "float-slow"}>
                  <PhoneFrame widthClass="w-[210px]">{SCREEN[g.screen]}</PhoneFrame>
                </div>
                <p className="mt-4 text-center text-xs text-ink-muted leading-relaxed px-2">{g.cap}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {ROWS.map((row, i) => (
        <section key={row.title} className="relative w-full px-4 md:px-8 lg:px-12 py-12 md:py-20 border-t border-line">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center max-w-[1300px] mx-auto">
            <div className={"reveal " + (row.reverse ? "lg:order-2" : "")}>
              <Eyebrow>{row.eyebrow}</Eyebrow>
              <h2 className="mt-3 font-display text-2xl sm:text-3xl md:text-4xl tracking-tight font-medium leading-tight">{row.title}</h2>
              <p className="mt-4 text-ink-muted text-sm md:text-base leading-relaxed max-w-md">{row.text}</p>
              <ul className="mt-6 space-y-2.5">
                {row.points.map((p) => (
                  <li key={p} className="flex items-center gap-2.5 text-sm md:text-[15px] text-ink-soft">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-lime-soft text-lime-deep">
                      <MIcon name="check" className="size-3.5" />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <div className={"reveal " + (row.reverse ? "lg:order-1" : "")}>
              <div className="relative">
                <div aria-hidden className="pointer-events-none absolute inset-0 blur-3xl opacity-40" style={{ background: GLOW[(i + 1) % 4] }} />
                <div className="relative">
                  <PhoneFrame widthClass="w-[250px]">{SCREEN[row.screen]}</PhoneFrame>
                </div>
              </div>
            </div>
          </div>
        </section>
      ))}

      <section className="relative w-full px-4 md:px-8 lg:px-12 py-12 md:py-16 border-t border-line bg-bg-soft">
        <div className="max-w-[1600px] mx-auto">
          <div className="text-center mb-10 md:mb-14 reveal">
            <Eyebrow center>Коротко</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-5xl tracking-tight font-medium">
              Что будет в приложении
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {FEATURES.map((f, i) => {
              const a = ACCENTS[i % 4];
              return (
                <div key={f.title} className={"group reveal rounded-2xl border border-line bg-gradient-to-br p-5 sm:p-6 md:p-7 transition hover:-translate-y-1 hover:shadow-xl " + TINT[a] + " " + HOVER[a]} style={{ animationDelay: i * 80 + "ms" }}>
                  <div className={"flex size-12 items-center justify-center rounded-2xl text-paper shadow-md transition group-hover:scale-110 group-hover:-rotate-3 " + TILE[a]}>
                    <MIcon name={f.icon} className="size-6" />
                  </div>
                  <h3 className="mt-5 font-display text-base sm:text-lg md:text-xl leading-tight font-medium">{f.title}</h3>
                  <p className="mt-2 text-sm text-ink-muted leading-relaxed">{f.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative w-full px-4 md:px-8 lg:px-12 py-12 md:py-16 border-t border-line">
        <div className="max-w-[1300px] mx-auto">
          <div className="text-center mb-10 md:mb-14 reveal">
            <Eyebrow center>Роадмап</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-5xl tracking-tight font-medium">
              Что дальше
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {ROADMAP.map((r, i) => (
              <div key={r.q} className="reveal relative rounded-2xl border border-line bg-paper p-5 sm:p-6 transition hover:-translate-y-1 hover:shadow-xl" style={{ animationDelay: i * 80 + "ms" }}>
                <div className="flex items-center gap-2.5">
                  <span className={"flex size-9 items-center justify-center rounded-full text-paper shadow-md " + TILE[ACCENTS[i % 4]]}>
                    {r.done ? <MIcon name="check" className="size-4" /> : <span className="font-mono text-sm font-semibold">{i + 1}</span>}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-ink-hush">{r.q}</span>
                </div>
                <p className="mt-3 font-display text-base leading-tight font-medium">{r.t}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pwa" className="relative w-full px-4 md:px-8 lg:px-12 py-12 md:py-16 border-t border-line bg-bg-soft">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-8 md:mb-10 reveal">
            <Eyebrow center>Уже сейчас</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-5xl tracking-tight font-medium">
              Установите веб-версию на телефон
            </h2>
            <p className="mt-4 text-ink-muted max-w-2xl mx-auto text-sm md:text-base leading-relaxed">
              Veloseller открывается как приложение прямо из браузера — иконка на экране, полный экран, без магазинов.
            </p>
          </div>
          <div className="reveal">
            <AppsInstallTabs />
          </div>
          <div className="mt-8 text-center reveal">
            <Link href={"/dashboard" as any} className="inline-flex rounded-lg bg-paper text-ink border border-line px-6 py-3.5 text-sm font-semibold hover:border-lime-deep/40 transition hover:-translate-y-0.5">
              Открыть веб-версию
            </Link>
          </div>
        </div>
      </section>

      <section className="relative w-full px-4 md:px-8 lg:px-12 py-16 md:py-24 border-t border-line">
        <div className="max-w-3xl mx-auto text-center reveal">
          <h2 className="font-display text-3xl md:text-5xl tracking-tight font-medium leading-tight">
            Будьте первыми{" "}
            <span className="bg-gradient-to-r from-lime-deep to-azure bg-clip-text text-transparent">в бете</span>
          </h2>
          <p className="mt-4 text-ink-muted text-base md:text-lg leading-relaxed">
            Создайте аккаунт — дадим ранний доступ к мобильной бете и сообщим о релизе в сторах.
          </p>
          <div className="mt-8">
            <Link href={"/register" as any} className="rounded-lg bg-ink text-paper px-6 py-3.5 text-sm font-semibold hover:bg-ink-soft transition shadow-[0_10px_30px_-10px_rgba(10,10,8,0.45)] hover:-translate-y-0.5">
              Получить ранний доступ
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter isAuthed={isAuthed} />
      <ScrollToTopButton />
    </main>
  );
}
