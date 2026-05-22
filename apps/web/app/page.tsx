import type { Metadata } from "next";
import Link from "next/link";
import { Icons } from "./_components/Icons";
import HeroVeloDemo from "./HeroVeloDemo";
import DashboardPreview from "./DashboardPreview";
import FaqAccordion from "./FaqAccordion";
import MobileMenu from "./_components/MobileMenu";
import ScrollToTopButton from "./_components/ScrollToTopButton";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { faqItems } from "@/lib/faq";

const SITE_URL = "https://veloseller.ru";

// Лендинг — server component с проверкой сессии. Авто-обновление на каждый
// запрос гарантирует, что зашедший в свой аккаунт юзер увидит "В кабинет"
// вместо "Войти", и наоборот.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Главная имеет свой title без template — он самый важный для SEO,
// title.absolute убирает суффикс " — Veloseller" из layout
export const metadata: Metadata = {
  title: {
    absolute: "Veloseller — управление остатками для Wildberries, Ozon FBO и FBS",
  },
  description:
    "Сервис для маркетплейс-селлеров: TVelo (реальная скорость продаж с учётом out-of-stock дней), дни покрытия, прогноз нехватки, расчёт минимального остатка (safety stock), потерянная выручка. Подключение через API Wildberries, Ozon или Google Sheets за 5 минут.",
  alternates: { canonical: "/" },
};

export default async function LandingPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isAuthed = !!user;

  // JSON-LD: один блок с @graph объединяет Organization + WebSite +
  // SoftwareApplication + FAQPage. Это рекомендуемый Google способ —
  // меньше шума в HTML, все сущности связаны через @id.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}#organization`,
        name: "Veloseller",
        url: SITE_URL,
        description:
          "Сервис управления остатками для селлеров Wildberries и Ozon. Расчёт TVelo, прогноз out-of-stock, safety stock, дни покрытия.",
        email: "info@proaim.ru",
        contactPoint: {
          "@type": "ContactPoint",
          email: "info@proaim.ru",
          contactType: "customer support",
          availableLanguage: ["Russian"],
        },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}#website`,
        name: "Veloseller",
        url: SITE_URL,
        description:
          "Управление остатками на Wildberries и Ozon. TVelo, дни покрытия, прогноз out-of-stock, safety stock.",
        inLanguage: "ru-RU",
        publisher: { "@id": `${SITE_URL}#organization` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}#software`,
        name: "Veloseller",
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Inventory Management",
        operatingSystem: "Web",
        url: SITE_URL,
        description:
          "Сервис управления складскими остатками для маркетплейс-селлеров. Считает реальную скорость продаж (TVelo) с учётом out-of-stock дней, прогнозирует нехватку товара, рассчитывает минимальный остаток (safety stock) и дни покрытия по каждому SKU на Ozon FBO/FBS, Wildberries и Google Sheets.",
        inLanguage: "ru-RU",
        offers: {
          "@type": "AggregateOffer",
          priceCurrency: "RUB",
          lowPrice: "2500",
          highPrice: "14900",
          offerCount: 3,
          offers: [
            {
              "@type": "Offer",
              name: "Старт",
              price: "2500",
              priceCurrency: "RUB",
              description: "2 склада",
            },
            {
              "@type": "Offer",
              name: "Рост",
              price: "6900",
              priceCurrency: "RUB",
              description: "6 складов",
            },
            {
              "@type": "Offer",
              name: "Про",
              price: "14900",
              priceCurrency: "RUB",
              description: "15 складов",
            },
          ],
        },
        featureList: [
          "TVelo — реальная скорость продаж с учётом out-of-stock",
          "Дни покрытия по каждому SKU",
          "Прогноз out-of-stock на 7-14 дней вперёд",
          "Расчёт минимального остатка (safety stock)",
          "Расчёт потерянной выручки из-за нехватки товара",
          "Алерты в Telegram и email",
          "Read-only интеграция с Wildberries, Ozon FBO/FBS, Google Sheets",
        ],
        publisher: { "@id": `${SITE_URL}#organization` },
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}#faq`,
        mainEntity: faqItems.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.a,
          },
        })),
      },
    ],
  };

  return (
    <main className="relative bg-paper-warm text-ink overflow-x-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-noise opacity-100 mix-blend-multiply" />
      <div
        aria-hidden
        className="pointer-events-none fixed -top-40 -left-40 size-[700px] rounded-full blur-3xl opacity-50"
        style={{ background: "radial-gradient(closest-side, rgba(132,204,22,0.25), transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -bottom-40 -right-40 size-[600px] rounded-full blur-3xl opacity-40"
        style={{ background: "radial-gradient(closest-side, rgba(2,132,199,0.15), transparent 70%)" }}
      />

      {/* ===== HEADER ===== */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-bg/85 border-b border-line">
        <div className="w-full px-4 md:px-8 lg:px-12 py-3 md:py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <Icons.Logo />
            <span className="font-display text-lg font-medium tracking-tight">
              Velo<span className="text-lime-deep">seller</span>
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-7">
            <a href="#features" className="text-sm text-ink-soft hover:text-lime-deep transition">Возможности</a>
            <a href="#how" className="text-sm text-ink-soft hover:text-lime-deep transition">Как работает</a>
            <a href="#integrations" className="text-sm text-ink-soft hover:text-lime-deep transition">Интеграции</a>
            <a href="#pricing" className="text-sm text-ink-soft hover:text-lime-deep transition">Тарифы</a>
            <Link href={"/news" as any} className="text-sm text-ink-soft hover:text-lime-deep transition">Новости</Link>
            <a href="#faq" className="text-sm text-ink-soft hover:text-lime-deep transition">FAQ</a>
          </nav>
          <div className="flex items-center gap-2 md:gap-3">
            {isAuthed ? (
              <Link
                href={"/dashboard" as any}
                className="hidden md:inline-flex items-center gap-2 rounded-lg bg-ink text-paper px-4 py-2 text-sm font-semibold hover:bg-ink-soft transition"
              >
                В кабинет <Icons.ArrowRight size={12} />
              </Link>
            ) : (
              <>
                <Link href={"/login" as any} className="hidden md:inline-block text-sm text-ink-soft hover:text-ink transition px-2 py-1">
                  Войти
                </Link>
                <Link
                  href={"/register" as any}
                  className="hidden md:inline-flex rounded-lg bg-ink text-paper px-4 py-2 text-sm font-semibold hover:bg-ink-soft transition"
                >
                  Начать
                </Link>
              </>
            )}
            <MobileMenu isAuthed={isAuthed} />
          </div>
        </div>
      </header>

      {/* ===== HERO ===== */}
      <section className="relative w-full px-4 md:px-8 lg:px-12 pt-12 pb-16 md:pt-20 md:pb-24">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-center max-w-[1600px] mx-auto">
          <div className="lg:col-span-6 reveal">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-lime-deep/30 bg-lime-soft">
              <span className="size-1.5 rounded-full bg-lime-deep animate-pulse" />
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime-deep font-semibold">
                Inventory intelligence v1.0
              </span>
            </div>

            <h1 className="mt-6 font-display text-[44px] sm:text-5xl md:text-6xl xl:text-7xl leading-[0.95] tracking-tight font-medium">
              Скорость продаж<br className="hidden sm:block" />{" "}
              <span className="text-lime-deep italic font-display">без искажений</span>
            </h1>

            <p className="mt-6 text-base md:text-lg text-ink-muted max-w-xl leading-relaxed">
              Если ваш отчёт делит продажи на все 30 дней — он ошибается. Мы
              исключаем дни, когда товара не было на складе, и показываем{" "}
              <span className="text-ink font-medium">реальную скорость продаж (TVelo)</span>,
              по которой можно планировать закупки, анализировать спрос и контролировать остатки.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={(isAuthed ? "/dashboard" : "/register") as any}
                className="group inline-flex items-center gap-2 rounded-lg bg-ink text-paper px-5 md:px-6 py-3.5 font-semibold hover:bg-ink-soft transition shadow-[0_10px_30px_-10px_rgba(10,10,8,0.4)]"
              >
                {isAuthed ? "В кабинет" : "Подключить склад"}
                {!isAuthed && <span className="font-mono text-xs opacity-60">5 мин</span>}
                <Icons.ArrowRight />
              </Link>
              <a href="#how" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-lime-deep transition px-2">
                Как это работает <Icons.ArrowRight size={12} />
              </a>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-hush font-mono">
              <span className="flex items-center gap-1.5 text-lime-deep"><Icons.Check size={12} /> <span className="text-ink-hush">30 дней бесплатно</span></span>
              <span className="flex items-center gap-1.5 text-lime-deep"><Icons.Check size={12} /> <span className="text-ink-hush">без карты</span></span>
              <span className="flex items-center gap-1.5 text-lime-deep"><Icons.Check size={12} /> <span className="text-ink-hush">только чтение данных</span></span>
            </div>
          </div>

          <div className="lg:col-span-6 reveal" style={{ animationDelay: "120ms" }}>
            <HeroVeloDemo />
          </div>
        </div>
      </section>

      {/* ===== STATS ===== */}
      <section className="relative w-full px-4 md:px-8 lg:px-12 py-10 md:py-14 border-y border-line bg-bg-soft">
        <div className="max-w-[1600px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10">
          {stats.map((s, i) => (
            <div key={i} className="relative">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hush">{s.label}</div>
              <div className="mt-1.5 font-display text-3xl md:text-5xl tabular tracking-tight font-medium">
                {s.value}
                {s.unit && <span className="text-xl md:text-2xl text-ink-muted ml-0.5">{s.unit}</span>}
              </div>
              <div className="mt-0.5 text-xs text-ink-muted">{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== INTEGRATIONS marquee ===== */}
      <section id="integrations" className="relative w-full py-14 md:py-20 border-b border-line overflow-hidden">
        <div className="w-full px-4 md:px-8 lg:px-12 mb-8 md:mb-10 max-w-[1600px] mx-auto">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <Eyebrow>Интеграции</Eyebrow>
              <h2 className="mt-2 font-display text-2xl md:text-4xl tracking-tight font-medium">
                Подключается ко всем<br className="hidden md:block"/> вашим источникам данных
              </h2>
            </div>
            <p className="text-ink-muted text-sm md:text-[15px] max-w-md">
              Read-only доступ через API маркетплейсов или Google Sheets. Каждый источник = отдельный склад.
            </p>
          </div>
        </div>

        <div className="relative">
          <div className="absolute left-0 top-0 bottom-0 w-16 md:w-32 bg-gradient-to-r from-bg to-transparent z-10" />
          <div className="absolute right-0 top-0 bottom-0 w-16 md:w-32 bg-gradient-to-l from-bg to-transparent z-10" />
          <div className="flex marquee-track gap-3 md:gap-4 w-max">
            {[...integrations, ...integrations].map((src, i) => {
              const isSoon = src.tag === "SOON";
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 rounded-xl border bg-paper px-5 md:px-7 py-4 md:py-5 shrink-0 transition shadow-sm ${
                    isSoon
                      ? "border-orange/30 hover:border-orange/50"
                      : "border-line hover:border-lime-deep/40"
                  }`}
                >
                  <span className="size-2.5 rounded-full" style={{ background: src.dot }} />
                  <span className={`font-display text-base md:text-xl tracking-tight font-medium ${isSoon ? "text-ink-muted" : "text-ink"}`}>
                    {src.name}
                  </span>
                  <span className={`font-mono text-[10px] uppercase tracking-widest font-semibold ${
                    isSoon ? "text-orange border border-orange/30 bg-orange/10 px-1.5 py-0.5 rounded" : "text-ink-hush"
                  }`}>
                    {src.tag}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== DASHBOARD PREVIEW ===== */}
      <section className="relative w-full px-4 md:px-8 lg:px-12 py-16 md:py-24">
        <div className="max-w-[1600px] mx-auto">
          <div className="flex items-end justify-between mb-8 md:mb-10 flex-wrap gap-4">
            <div>
              <Eyebrow>Панель управления</Eyebrow>
              <h2 className="mt-2 font-display text-3xl md:text-5xl tracking-tight max-w-2xl font-medium">
                Не таблица. <span className="text-ink-hush">Командный центр.</span>
              </h2>
            </div>
            <p className="text-ink-muted max-w-md text-sm md:text-[15px]">
              Сразу видно: что заканчивается, что становится неликвидом и где
              теряются деньги из-за неправильного расчёта скорости продаж.
            </p>
          </div>
          <DashboardPreview />
        </div>
      </section>

      {/* ===== BENTO FEATURES ===== */}
      <section id="features" className="relative w-full px-4 md:px-8 lg:px-12 py-16 md:py-24 border-t border-line bg-bg-soft">
        <div className="max-w-[1600px] mx-auto">
          <div className="text-center mb-10 md:mb-14">
            <Eyebrow center>Возможности</Eyebrow>
            <h2 className="mt-2 font-display text-3xl md:text-5xl tracking-tight font-medium">
              Шесть вещей, которые экономят деньги
            </h2>
            <p className="mt-4 text-ink-muted max-w-2xl mx-auto text-sm md:text-base">
              Каждая цифра подкреплена методологией и показателем достоверности данных.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 auto-rows-[minmax(180px,_auto)]">
            <div className="md:col-span-2 md:row-span-2 rounded-2xl border border-line bg-paper p-6 md:p-8 hover:border-lime-deep/40 transition shadow-sm relative overflow-hidden">
              <div className="absolute -top-10 -right-10 size-48 rounded-full bg-lime-soft blur-2xl" />
              <div className="relative">
                <div className="flex items-center gap-3">
                  <div className="flex size-11 items-center justify-center rounded-lg bg-lime text-ink"><Icons.Speed /></div>
                  <span className="font-mono text-[10px] text-ink-hush">01 / ОСНОВНОЙ</span>
                </div>
                <h3 className="mt-5 md:mt-6 font-display text-2xl md:text-4xl tracking-tight font-medium">TVelo — реальная скорость продаж</h3>
                <p className="mt-3 text-ink-muted max-w-lg text-sm md:text-base leading-relaxed">
                  Считает скорость продаж, вычитая дни отсутствия товара на складе. Реальная
                  картина: какой товар продаётся быстро, какой становится неликвидом. Разница
                  с обычным расчётом может достигать 50%.
                </p>
                <div className="mt-5 md:mt-6 rounded-xl border border-line bg-bg-soft p-4 inline-flex items-center gap-3 md:gap-4 flex-wrap">
                  <div>
                    <div className="font-mono text-[10px] text-ink-hush">продажи / период</div>
                    <div className="font-mono text-lg md:text-xl text-ink-hush tabular line-through decoration-orange decoration-2">2.00</div>
                  </div>
                  <Icons.ArrowRight />
                  <div>
                    <div className="font-mono text-[10px] text-lime-deep font-semibold">TVelo</div>
                    <div className="font-mono text-lg md:text-xl text-ink tabular font-semibold">3.00 <span className="text-sm text-lime-deep">+50%</span></div>
                  </div>
                </div>
              </div>
            </div>

            <BentoCard idx="02" icon={<Icons.Coverage />} title="Дни покрытия" text="На сколько хватит остатков. Сигнал заранее, а не когда уже товар закончился." accent="azure" />
            <BentoCard idx="03" icon={<Icons.Health />}   title="Потерянная выручка"  text="Сколько выручки теряется из-за отсутствия товара на складе." accent="lime" />
            <BentoCard idx="04" icon={<Icons.Shield />}   title="Планирование закупки" text="Расчёты с учётом реальной скорости продаж и времени поставки." accent="emerald" />
            <BentoCard idx="05" icon={<Icons.Bell />}     title="Замороженные остатки" text="Сколько денег заморожено в SKU с низкой скоростью продаж." accent="orange" />
            <BentoCard idx="06" icon={<Icons.Plug />}     title="Достоверность данных" text="Рассчитываем точность данных для принятия решений." accent="azure" />
          </div>
        </div>
      </section>

      {/* ===== СРАВНЕНИЕ ===== */}
      <section className="relative w-full px-4 md:px-8 lg:px-12 py-16 md:py-24 border-t border-line">
        <div className="max-w-[1600px] mx-auto">
          <div className="text-center mb-10 md:mb-14">
            <Eyebrow center>Сравнение</Eyebrow>
            <h2 className="mt-2 font-display text-3xl md:text-5xl tracking-tight font-medium">
              Excel vs Veloseller
            </h2>
            <p className="mt-3 text-ink-muted text-sm md:text-base">
              Что меняется, когда перестаёшь считать вручную
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4 md:gap-6">
            <div className="rounded-2xl border-2 border-line bg-bg-soft p-6 md:p-8 relative">
              <div className="absolute -top-3 left-7 px-2.5 py-0.5 rounded bg-paper border border-line-2">
                <span className="font-mono text-[10px] text-ink-hush uppercase tracking-widest">ДО</span>
              </div>
              <h3 className="font-display text-xl md:text-2xl mt-3 text-ink-muted font-medium">Excel-табличка</h3>
              <ul className="mt-5 space-y-3">
                {compareLeft.map((it) => (
                  <li key={it} className="flex items-start gap-3 text-ink-muted text-sm md:text-base">
                    <span className="text-rose shrink-0 mt-0.5"><Icons.Cross /></span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border-2 border-lime-deep/40 bg-lime-soft p-6 md:p-8 relative shadow-[0_20px_60px_-20px_rgba(132,204,22,0.3)]">
              <div className="absolute -top-3 left-7 px-2.5 py-0.5 rounded bg-ink text-paper">
                <span className="font-mono text-[10px] uppercase tracking-widest">ПОСЛЕ</span>
              </div>
              <h3 className="font-display text-xl md:text-2xl mt-3 text-ink font-medium">Veloseller</h3>
              <ul className="mt-5 space-y-3">
                {compareRight.map((it) => (
                  <li key={it} className="flex items-start gap-3 text-ink-soft font-medium text-sm md:text-base">
                    <span className="text-lime-deep shrink-0 mt-0.5"><Icons.Check /></span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section id="how" className="relative w-full px-4 md:px-8 lg:px-12 py-16 md:py-24 border-t border-line bg-bg-soft">
        <div className="max-w-[1600px] mx-auto">
          <div className="text-center mb-12 md:mb-16">
            <Eyebrow center>Как это работает</Eyebrow>
            <h2 className="mt-2 font-display text-3xl md:text-5xl tracking-tight font-medium">
              От Excel до решения — <span className="text-lime-deep italic">в три шага</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4 md:gap-6">
            {steps.map((s, i) => (
              <div key={i} className="relative rounded-2xl border border-line bg-paper p-6 md:p-7 hover:border-lime-deep/40 hover:shadow-lg transition">
                <div className="flex items-center justify-between">
                  <div className="font-display text-4xl md:text-5xl text-lime-deep/80 tabular font-medium">0{i + 1}</div>
                  <span className="font-mono text-[10px] text-ink-hush uppercase tracking-widest">Шаг 0{i + 1}</span>
                </div>
                <h3 className="mt-4 md:mt-5 font-display text-lg md:text-xl font-medium">{s.title}</h3>
                <p className="mt-3 text-sm text-ink-muted leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section className="relative w-full px-4 md:px-8 lg:px-12 py-16 md:py-24 border-t border-line">
        <div className="max-w-[1600px] mx-auto">
          <div className="text-center mb-10 md:mb-14">
            <Eyebrow center>Отзывы</Eyebrow>
            <h2 className="mt-2 font-display text-3xl md:text-5xl tracking-tight font-medium">
              Селлеры о цифрах, которые увидели впервые
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4 md:gap-5">
            {testimonials.map((t, i) => (
              <div key={i} className="rounded-2xl border border-line bg-paper p-6 md:p-7 hover:shadow-lg transition">
                <div className="flex items-center gap-1 text-lime-deep">
                  {[...Array(5)].map((_, j) => <Icons.Star key={j} />)}
                </div>
                <p className="mt-4 text-sm md:text-[15px] text-ink-soft leading-relaxed">{t.quote}</p>
                <div className="mt-5 md:mt-6 flex items-center gap-3">
                  <div className="size-10 rounded-full flex items-center justify-center font-display text-base font-medium" style={{ background: t.avatarBg, color: t.avatarColor }}>
                    {t.initials}
                  </div>
                  <div>
                    <div className="font-medium text-sm text-ink">{t.name}</div>
                    <div className="font-mono text-[10px] text-ink-hush uppercase tracking-wider">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PRICING ===== */}
      <section id="pricing" className="relative w-full px-4 md:px-8 lg:px-12 py-16 md:py-24 border-t border-line bg-bg-soft">
        <div className="max-w-[1600px] mx-auto">
          <div className="text-center mb-10 md:mb-12">
            <Eyebrow center>Цены</Eyebrow>
            <h2 className="mt-2 font-display text-3xl md:text-5xl tracking-tight font-medium">
              Простые тарифы. Никаких звёздочек.
            </h2>
            <p className="mt-3 text-ink-muted text-sm md:text-base">Триал 30 дней — 15 складов бесплатно. Без карты.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4 md:gap-6 max-w-6xl mx-auto">
            {plans.map((p) => <PricingCard key={p.name} {...p} isAuthed={isAuthed} />)}
          </div>
          <p className="mt-8 md:mt-10 text-center font-mono text-xs text-ink-hush flex items-center justify-center flex-wrap gap-x-2 gap-y-1">
            <span>Все тарифы включают весь функционал:</span>
            <span>TVelo</span><Icons.Dot size={3} /> <span>Покрытие</span><Icons.Dot size={3} /> <span>Потерянная выручка</span><Icons.Dot size={3} /> <span>Планирование закупки</span><Icons.Dot size={3} /> <span>Email + Telegram</span>
          </p>
          <p className="mt-3 text-center font-mono text-[11px] text-ink-hush">
            Для интеграторов и агентств: <a href="mailto:info@proaim.ru" className="text-lime-deep hover:underline">info@proaim.ru</a>
          </p>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section id="faq" className="relative w-full px-4 md:px-8 lg:px-12 py-16 md:py-24 border-t border-line">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-10 md:mb-14">
            <Eyebrow center>FAQ</Eyebrow>
            <h2 className="mt-2 font-display text-3xl md:text-5xl tracking-tight font-medium">
              Частые вопросы
            </h2>
          </div>
          <FaqAccordion />
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="relative w-full px-4 md:px-8 lg:px-12 py-16 md:py-24">
        <div className="max-w-[1600px] mx-auto">
          <div className="relative overflow-hidden rounded-3xl border-2 border-lime-deep/30 bg-gradient-to-br from-lime-soft via-paper to-paper p-8 md:p-16 lg:p-20">
            <div className="absolute -right-20 -top-20 size-80 rounded-full bg-lime/30 blur-3xl" />
            <div className="absolute -left-20 -bottom-20 size-60 rounded-full bg-azure/20 blur-3xl" />
            <div className="relative z-10 max-w-3xl">
              <h2 className="font-display text-3xl md:text-5xl lg:text-6xl tracking-tight leading-[1.05] font-medium">
                Перестань считать <span className="text-lime-deep italic">скорость продаж вручную.</span>
              </h2>
              <p className="mt-4 md:mt-5 text-ink-muted text-base md:text-lg max-w-2xl leading-relaxed">
                Подключи склад — Ozon FBO/FBS, Wildberries или Google Sheet.
                Первый расчёт через 30 минут, точная аналитика через 7 дней.
              </p>
              <div className="mt-7 md:mt-8 flex flex-wrap gap-3 md:gap-4">
                <Link
                  href={(isAuthed ? "/dashboard" : "/register") as any}
                  className="inline-flex items-center gap-2 rounded-lg bg-ink text-paper px-6 md:px-7 py-3.5 md:py-4 text-base font-semibold hover:bg-ink-soft transition shadow-[0_10px_30px_-10px_rgba(10,10,8,0.4)]"
                >
                  {isAuthed ? "Открыть кабинет" : "Начать бесплатно"} <Icons.ArrowRight />
                </Link>
                <a href="#pricing" className="inline-flex items-center px-6 md:px-7 py-3.5 md:py-4 text-ink-muted hover:text-lime-deep transition">
                  Посмотреть тарифы
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="border-t border-line bg-bg-soft">
        <div className="max-w-[1600px] mx-auto w-full px-4 md:px-8 lg:px-12 py-12 md:py-16">
          <div className="grid grid-cols-2 md:grid-cols-12 gap-8 md:gap-10">
            <div className="col-span-2 md:col-span-4">
              <div className="flex items-center gap-2.5">
                <Icons.Logo />
                <span className="font-display text-xl tracking-tight font-medium">Veloseller</span>
              </div>
              <p className="mt-5 text-sm text-ink-muted max-w-xs leading-relaxed">
                Управление складом для маркетплейс-селлеров. TVelo, дни покрытия,
                достоверность данных — расчёты, которым можно доверять.
              </p>
            </div>
            <FooterCol title="Продукт" items={[
              ["#features", "Возможности"],
              ["#how", "Как работает"],
              ["#pricing", "Тарифы"],
              ["/news", "Новости"],
              ["#faq", "FAQ"],
            ]} />
            <div className="col-span-1 md:col-span-2">
              <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">Типы складов</div>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li className="text-ink-soft">Ozon FBO</li>
                <li className="text-ink-soft">Ozon FBS</li>
                <li className="text-ink-soft">Wildberries FBO</li>
                <li className="flex items-center gap-1.5 text-ink-soft">
                  Wildberries FBS
                  <span className="font-mono text-[9px] text-orange uppercase border border-orange/30 bg-orange/10 px-1 rounded">soon</span>
                </li>
                <li className="text-ink-soft">Google Sheet</li>
              </ul>
            </div>
            <FooterCol title="Аккаунт" items={
              isAuthed
                ? [["/dashboard", "Кабинет"], ["/billing", "Тариф"], ["/account", "Профиль"], ["#", "Поддержка"]]
                : [["/login", "Войти"], ["/register", "Регистрация"], ["#", "Документация"], ["#", "Поддержка"]]
            } />
            <FooterCol title="Сообщество" items={[
              ["#", "Telegram"],
              ["mailto:info@proaim.ru", "info@proaim.ru"],
              ["#", "GitHub"],
            ]} />
          </div>
          <div className="mt-10 md:mt-12 pt-6 md:pt-8 border-t border-line flex flex-wrap items-center justify-between gap-4">
            <div className="font-mono text-xs text-ink-hush">
              © {new Date().getFullYear()} Veloseller — управление складом для ecommerce
            </div>
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-lime-deep animate-pulse" />
              <span className="font-mono text-xs text-ink-hush">все системы работают</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Кнопка "вверх" — появляется после скролла */}
      <ScrollToTopButton />
    </main>
  );
}

// ============================================================
function Eyebrow({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <div className={`inline-flex items-center gap-2 ${center ? "" : ""}`}>
      <span className="size-1 rounded-full bg-lime-deep" />
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">{children}</span>
    </div>
  );
}

function BentoCard({ idx, icon, title, text, accent }: {
  idx: string; icon: React.ReactNode; title: string; text: string;
  accent: "lime" | "azure" | "orange" | "emerald";
}) {
  const accentColor =
    accent === "lime"    ? "text-lime-deep bg-lime-soft" :
    accent === "azure"   ? "text-azure bg-azure/10" :
    accent === "emerald" ? "text-emerald bg-emerald/10" :
                           "text-orange bg-orange/10";
  return (
    <div className="rounded-2xl border border-line bg-paper p-6 md:p-7 hover:border-lime-deep/40 hover:shadow-lg transition group">
      <div className="flex items-center justify-between">
        <div className={`flex size-11 items-center justify-center rounded-lg ${accentColor} group-hover:scale-110 transition`}>
          {icon}
        </div>
        <span className="font-mono text-[10px] text-ink-hush tabular">{idx}</span>
      </div>
      <h3 className="mt-5 font-display text-lg md:text-xl leading-tight font-medium">{title}</h3>
      <p className="mt-2 text-sm text-ink-muted leading-relaxed">{text}</p>
    </div>
  );
}

function PricingCard({ name, price, highlight, perks, isAuthed }: typeof plans[number] & { isAuthed: boolean }) {
  return (
    <div className={`relative rounded-2xl p-6 md:p-8 transition ${
      highlight
        ? "border-2 border-lime-deep bg-paper shadow-[0_20px_60px_-20px_rgba(132,204,22,0.3)]"
        : "border border-line bg-paper hover:shadow-lg"
    }`}>
      {highlight && (
        <span className="absolute -top-3 right-7 px-3 py-0.5 rounded-full bg-lime-deep text-paper font-mono text-[10px] uppercase tracking-widest">
          Популярный
        </span>
      )}
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">{name}</div>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="font-display text-5xl md:text-6xl tracking-tight text-ink tabular font-medium">{price.toLocaleString("ru-RU")}</span>
        <span className="text-ink-muted text-2xl ml-1">₽</span>
        <span className="text-ink-muted">/мес</span>
      </div>
      <ul className="mt-6 md:mt-7 space-y-3">
        {perks.map((perk) => (
          <li key={perk} className="flex items-start gap-2.5 text-sm md:text-[15px] text-ink-soft">
            <span className="text-lime-deep shrink-0 mt-0.5"><Icons.Check /></span>
            <span>{perk}</span>
          </li>
        ))}
      </ul>
      <Link
        href={(isAuthed ? "/billing" : "/register") as any}
        className={`mt-7 md:mt-8 block rounded-lg px-4 py-3 text-center text-sm font-semibold transition ${
          highlight
            ? "bg-ink text-paper hover:bg-ink-soft"
            : "bg-bg-soft text-ink border border-line hover:border-lime-deep/40"
        }`}
      >
        {isAuthed ? "Управлять подпиской" : "Начать бесплатно"}
      </Link>
    </div>
  );
}

function FooterCol({ title, items }: { title: string; items: [string, string][] }) {
  return (
    <div className="col-span-1 md:col-span-2">
      <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">{title}</div>
      <ul className="mt-4 space-y-2.5 text-sm">
        {items.map(([href, label]) => (
          <li key={label}>
            <Link href={href as any} className="text-ink-soft hover:text-lime-deep transition">{label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================
const stats = [
  { label: "Точность TVelo", value: "+47", unit: "%", sub: "vs обычная скорость продаж" },
  { label: "Среднее время настройки", value: "5", unit: "мин", sub: "от регистрации до данных" },
  { label: "Типов складов", value: "5", sub: "Ozon FBO/FBS, WB FBO/FBS, Sheets" },
  { label: "Метрик по каждому SKU", value: "23", sub: "включая достоверность данных" },
];
const integrations = [
  { name: "Ozon FBO",        tag: "API",       dot: "#005bff" },
  { name: "Ozon FBS",        tag: "API",       dot: "#005bff" },
  { name: "Wildberries FBO", tag: "API",       dot: "#a71179" },
  { name: "Wildberries FBS", tag: "SOON",      dot: "#a71179" },
  { name: "Google Sheets",   tag: "READ-ONLY", dot: "#0F9D58" },
  { name: "Telegram",        tag: "BOT",       dot: "#229ED9" },
  { name: "Resend",          tag: "EMAIL",     dot: "#000" },
];
const compareLeft = [
  "Считаешь скорость продаж вручную раз в месяц",
  "Не учитываешь дни отсутствия товара на складе — данные искажены",
  "Не видишь сколько денег зависло в неликвиде",
  "Тревожные сигналы приходят постфактум, когда уже поздно",
];
const compareRight = [
  "Вычитаем дни отсутствия товара на складе — реальная скорость продаж",
  "Сигнал на закупку за 7–14 дней до окончания остатков",
  "Telegram + email отчёты каждое утро",
];
const steps = [
  { title: "Подключи склад",     text: "Ozon FBO/FBS, Wildberries или Google Sheet — выбери источник, дай read-only ключ. Каждый источник = отдельный склад с собственной аналитикой." },
  { title: "Получи первый расчёт",   text: "Через 30 минут — сводная информация по складу. Через 7 дней — первые TVelo и другие показатели. Через 30 дней — значительно улучшена достоверность данных." },
  { title: "Управляй запасами на основе данных",   text: "Получай сигналы в Telegram и email, следи за рисками, планируй закупки и контролируй остатки в одном дашборде." },
];
const testimonials = [
  { quote: "Наконец перестал считать скорость продаж в Excel. Через неделю увидел, что 12% оборотных денег заморожено в неликвиде — закрыл закупку на пару SKU и освободил 380к.", name: "Артём Кузнецов", role: "Селлер на Ozon, 1200 SKU", initials: "АК", avatarBg: "#84cc16", avatarColor: "#0a0a08" },
  { quote: "TVelo показал, что половина моих медленных товаров на самом деле быстрые — просто часто уходили в out-of-stock. Перезаказал — выручка +18% за месяц.", name: "Мария Логинова", role: "WB Premium, 3400 SKU", initials: "МЛ", avatarBg: "#0284c7", avatarColor: "#fff" },
  { quote: "Telegram-уведомления — главная фишка. Не сижу в дашборде. Приходит сигнал и пошёл, заказал, забыл.", name: "Дмитрий Беляев", role: "Multi-marketplace, 800 SKU", initials: "ДБ", avatarBg: "#ea580c", avatarColor: "#fff" },
];
const plans = [
  { name: "Старт", price: 2500,  highlight: false, perks: ["2 склада"] },
  { name: "Рост",  price: 6900,  highlight: true,  perks: ["6 складов"] },
  { name: "Про",   price: 14900, highlight: false, perks: ["15 складов"] },
];
