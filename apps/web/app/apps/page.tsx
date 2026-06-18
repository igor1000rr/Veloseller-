import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import LandingHeader from "../_landing/Header";
import LandingFooter from "../_landing/Footer";
import ScrollToTopButton from "../_components/ScrollToTopButton";
import AppsPhoneDemo from "../_components/AppsPhoneDemo";
import AppsInstallTabs from "../_components/AppsInstallTabs";
import { MIcon } from "../_components/MarketingIcons";
import { Eyebrow } from "../_landing/ui";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  { icon: "dashboard", title: "Дашборд на ходу", text: "Остатки, TVelo, дни покрытия и health score — всё под рукой, без ноутбука." },
  { icon: "bell", title: "Push о дозаказе", text: "Уведомления: товар пора заказать, остаток упал, синхронизация сломалась." },
  { icon: "box", title: "Склады WB и Ozon", text: "Быстрый просмотр по складам Wildberries и Ozon FBO/FBS в одном окне." },
  { icon: "chart", title: "Прогноз нехватки", text: "Сколько дней до нуля и сколько везти — расчёт в кармане." },
];

export default async function AppsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isAuthed = !!user;

  return (
    <main className="relative bg-paper-warm text-ink overflow-x-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-noise opacity-100 mix-blend-multiply" />
      <div aria-hidden className="pointer-events-none fixed -top-40 -left-40 size-[700px] rounded-full blur-3xl opacity-50 float" style={{ background: "radial-gradient(closest-side, rgba(132,204,22,0.28), transparent 70%)" }} />
      <div aria-hidden className="pointer-events-none fixed -bottom-40 -right-40 size-[600px] rounded-full blur-3xl opacity-40 float-slow" style={{ background: "radial-gradient(closest-side, rgba(2,132,199,0.18), transparent 70%)" }} />

      <LandingHeader isAuthed={isAuthed} />

      <section className="relative w-full px-4 md:px-8 lg:px-12 pt-12 pb-10 md:pt-20 md:pb-16">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-center max-w-[1600px] mx-auto">
          <div className="lg:col-span-7 reveal">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-lime-deep/30 bg-lime-soft">
              <span className="size-1.5 rounded-full bg-lime-deep animate-pulse" />
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime-deep font-semibold">Мобильное приложение · скоро</span>
            </span>
            <h1 className="mt-6 font-display text-4xl sm:text-5xl md:text-6xl xl:text-7xl tracking-tight font-medium leading-[0.98]">
              Veloseller в кармане.{" "}
              <span className="bg-gradient-to-r from-lime-deep to-azure bg-clip-text text-transparent italic">Скоро</span>{" "}
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
            <AppsPhoneDemo />
          </div>
        </div>
      </section>

      <section className="relative w-full px-4 md:px-8 lg:px-12 py-12 md:py-16 border-t border-line bg-bg-soft">
        <div className="max-w-[1600px] mx-auto">
          <div className="text-center mb-10 md:mb-14 reveal">
            <Eyebrow center>Что будет в приложении</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-5xl tracking-tight font-medium">
              Аналитика остатков всегда с собой
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {FEATURES.map((f, i) => {
              const a = ACCENTS[i % 4];
              return (
                <div key={f.title} className={"group reveal rounded-2xl border border-line bg-paper p-5 sm:p-6 md:p-7 transition hover:-translate-y-1 hover:shadow-xl " + HOVER[a]} style={{ animationDelay: i * 80 + "ms" }}>
                  <div className={"flex size-12 items-center justify-center rounded-2xl transition group-hover:scale-110 group-hover:-rotate-3 " + CHIP[a]}>
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

      <section id="pwa" className="relative w-full px-4 md:px-8 lg:px-12 py-12 md:py-16 border-t border-line">
        <div className="max-w-3xl mx-auto">
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
