import Link from "next/link";
import { Icons } from "./_components/Icons";
import HeroVeloDemo from "./HeroVeloDemo";
import DashboardPreview from "./DashboardPreview";
import FaqAccordion from "./FaqAccordion";
import MobileMenu from "./_components/MobileMenu";

export default function LandingPage() {
  return (
    <main className="relative bg-paper-warm text-ink overflow-x-hidden">
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
            <a href="#faq" className="text-sm text-ink-soft hover:text-lime-deep transition">FAQ</a>
          </nav>
          <div className="flex items-center gap-2 md:gap-3">
            <Link href={"/login" as any} className="hidden md:inline-block text-sm text-ink-soft hover:text-ink transition px-2 py-1">
              Войти
            </Link>
            <Link
              href={"/register" as any}
              className="hidden md:inline-flex rounded-lg bg-ink text-paper px-4 py-2 text-sm font-semibold hover:bg-ink-soft transition"
            >
              Начать
            </Link>
            <MobileMenu />
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
              <span className="text-lime-deep italic font-display">без вранья</span>
            </h1>

            <p className="mt-6 text-base md:text-lg text-ink-muted max-w-xl leading-relaxed">
              Если ваш отчёт делит продажи на 30 дней — он лжёт. Мы вычитаем дни,
              когда товара не было на складе, и показываем{" "}
              <span className="text-ink font-medium">реальную скорость продаж</span> —
              ту, по которой можно планировать закупку.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={"/register" as any}
                className="group inline-flex items-center gap-2 rounded-lg bg-ink text-paper px-5 md:px-6 py-3.5 font-semibold hover:bg-ink-soft transition shadow-[0_10px_30px_-10px_rgba(10,10,8,0.4)]"
              >
                Подключить магазин
                <span className="font-mono text-xs opacity-60">5 мин</span>
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
              <Eyebrow>Integrations</Eyebrow>
              <h2 className="mt-2 font-display text-2xl md:text-4xl tracking-tight font-medium">
                Подключается ко всему,<br className="hidden md:block"/> где живут твои данные
              </h2>
            </div>
            <p className="text-ink-muted text-sm md:text-[15px] max-w-md">
              Read-only доступ через API маркетплейсов, или просто пришли CSV или Google Sheet.{" "}
              <span className="text-orange font-medium">Shopify и Amazon — скоро.</span>
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
              <Eyebrow>Console</Eyebrow>
              <h2 className="mt-2 font-display text-3xl md:text-5xl tracking-tight max-w-2xl font-medium">
                Не таблица. <span className="text-ink-hush">Командный центр.</span>
              </h2>
            </div>
            <p className="text-ink-muted max-w-md text-sm md:text-[15px]">
              Видишь сразу: что заканчивается, что зависло мёртвым грузом, и сколько
              теряешь каждый день из-за неправильной velocity.
            </p>
          </div>
          <DashboardPreview />
        </div>
      </section>

      {/* ===== BENTO FEATURES ===== */}
      <section id="features" className="relative w-full px-4 md:px-8 lg:px-12 py-16 md:py-24 border-t border-line bg-bg-soft">
        <div className="max-w-[1600px] mx-auto">
          <div className="text-center mb-10 md:mb-14">
            <Eyebrow center>Features</Eyebrow>
            <h2 className="mt-2 font-display text-3xl md:text-5xl tracking-tight font-medium">
              Шесть вещей, которые экономят деньги
            </h2>
            <p className="mt-4 text-ink-muted max-w-2xl mx-auto text-sm md:text-base">
              Не «решения для бизнеса», а конкретные расчёты по каждому SKU. Каждая цифра
              подкреплена методологией и confidence-показателем.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 auto-rows-[minmax(180px,_auto)]">
            <div className="md:col-span-2 md:row-span-2 rounded-2xl border border-line bg-paper p-6 md:p-8 hover:border-lime-deep/40 transition shadow-sm relative overflow-hidden">
              <div className="absolute -top-10 -right-10 size-48 rounded-full bg-lime-soft blur-2xl" />
              <div className="relative">
                <div className="flex items-center gap-3">
                  <div className="flex size-11 items-center justify-center rounded-lg bg-lime text-ink"><Icons.Speed /></div>
                  <span className="font-mono text-[10px] text-ink-hush">01 / CORE</span>
                </div>
                <h3 className="mt-5 md:mt-6 font-display text-2xl md:text-4xl tracking-tight font-medium">TVelo — честная velocity</h3>
                <p className="mt-3 text-ink-muted max-w-lg text-sm md:text-base leading-relaxed">
                  Считает скорость продаж, вычитая дни OOS. Реальная картина: какой товар
                  продаётся быстро, какой — мёртв. Разница с обычным расчётом может достигать 50%.
                </p>
                <div className="mt-5 md:mt-6 rounded-xl border border-line bg-bg-soft p-4 inline-flex items-center gap-3 md:gap-4 flex-wrap">
                  <div>
                    <div className="font-mono text-[10px] text-ink-hush">sales / period</div>
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

            <BentoCard idx="02" icon={<Icons.Coverage />} title="Дни покрытия" text="На сколько хватит остатков. Сигнал заранее, а не когда уже OOS." accent="azure" />
            <BentoCard idx="03" icon={<Icons.Health />}   title="Health Score 0-100"  text="Состояние склада одной цифрой. Дефицит, неликвид, тренд." accent="lime" />
            <BentoCard idx="04" icon={<Icons.Shield />}   title="Confidence-брейкдаун" text="Видно насколько надёжна метрика. Аномалии, пополнения, пропуски." accent="emerald" />
            <BentoCard idx="05" icon={<Icons.Bell />}     title="Умные уведомления" text="Telegram и email. Только важное: скоро закончится, повторный OOS." accent="orange" />
            <BentoCard idx="06" icon={<Icons.Plug />}     title="Гибкие источники данных" text="Sheets, CSV, Ozon, WB, YML. Скоро: Shopify и Amazon SP-API." accent="azure" />
          </div>
        </div>
      </section>

      {/* ===== СРАВНЕНИЕ ===== */}
      <section className="relative w-full px-4 md:px-8 lg:px-12 py-16 md:py-24 border-t border-line">
        <div className="max-w-[1600px] mx-auto">
          <div className="text-center mb-10 md:mb-14">
            <Eyebrow center>Compare</Eyebrow>
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
            <Eyebrow center>How it works</Eyebrow>
            <h2 className="mt-2 font-display text-3xl md:text-5xl tracking-tight font-medium">
              От Excel до решения — <span className="text-lime-deep italic">три шага</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4 md:gap-6">
            {steps.map((s, i) => (
              <div key={i} className="relative rounded-2xl border border-line bg-paper p-6 md:p-7 hover:border-lime-deep/40 hover:shadow-lg transition">
                <div className="flex items-center justify-between">
                  <div className="font-display text-4xl md:text-5xl text-lime-deep/80 tabular font-medium">0{i + 1}</div>
                  <span className="font-mono text-[10px] text-ink-hush uppercase tracking-widest">step 0{i + 1}</span>
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
            <Eyebrow center>Selled</Eyebrow>
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
            <Eyebrow center>Pricing</Eyebrow>
            <h2 className="mt-2 font-display text-3xl md:text-5xl tracking-tight font-medium">
              Простые тарифы. Никаких звёздочек.
            </h2>
            <p className="mt-3 text-ink-muted text-sm md:text-base">Первый месяц бесплатно. Без карты.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4 md:gap-6 max-w-6xl mx-auto">
            {plans.map((p) => <PricingCard key={p.name} {...p} />)}
          </div>
          <p className="mt-8 md:mt-10 text-center font-mono text-xs text-ink-hush flex items-center justify-center flex-wrap gap-x-2 gap-y-1">
            <span>Все тарифы включают:</span>
            <span>TVelo</span><Icons.Dot size={3} /> <span>Alerts</span><Icons.Dot size={3} /> <span>Дашборд</span><Icons.Dot size={3} /> <span>Email + Telegram</span>
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
                Перестань считать <span className="text-lime-deep italic">velocity вручную.</span>
              </h2>
              <p className="mt-4 md:mt-5 text-ink-muted text-base md:text-lg max-w-2xl leading-relaxed">
                Подключи источник данных — Google Sheet, CSV или API маркетплейса.
                Первый расчёт через 30 минут, точная аналитика через 7 дней.
              </p>
              <div className="mt-7 md:mt-8 flex flex-wrap gap-3 md:gap-4">
                <Link
                  href={"/register" as any}
                  className="inline-flex items-center gap-2 rounded-lg bg-ink text-paper px-6 md:px-7 py-3.5 md:py-4 text-base font-semibold hover:bg-ink-soft transition shadow-[0_10px_30px_-10px_rgba(10,10,8,0.4)]"
                >
                  Начать бесплатно <Icons.ArrowRight />
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
                Inventory intelligence для маркетплейс-селлеров. TVelo, health score,
                confidence — расчёты, которым можно доверять.
              </p>
            </div>
            <FooterCol title="Продукт" items={[
              ["#features", "Возможности"],
              ["#how", "Как работает"],
              ["#pricing", "Тарифы"],
              ["#faq", "FAQ"],
            ]} />
            <div className="col-span-1 md:col-span-2">
              <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">Интеграции</div>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li className="text-ink-soft">Ozon API</li>
                <li className="text-ink-soft">Wildberries API</li>
                <li className="text-ink-soft">Google Sheets</li>
                <li className="text-ink-soft">CSV upload</li>
                <li className="flex items-center gap-1.5 text-ink-soft">
                  Shopify
                  <span className="font-mono text-[9px] text-orange uppercase border border-orange/30 bg-orange/10 px-1 rounded">soon</span>
                </li>
                <li className="flex items-center gap-1.5 text-ink-soft">
                  Amazon SP-API
                  <span className="font-mono text-[9px] text-orange uppercase border border-orange/30 bg-orange/10 px-1 rounded">soon</span>
                </li>
              </ul>
            </div>
            <FooterCol title="Аккаунт" items={[
              ["/login", "Войти"],
              ["/register", "Регистрация"],
              ["#", "Документация"],
              ["#", "Поддержка"],
            ]} />
            <FooterCol title="Сообщество" items={[
              ["#", "Telegram"],
              ["#", "Email"],
              ["#", "GitHub"],
            ]} />
          </div>
          <div className="mt-10 md:mt-12 pt-6 md:pt-8 border-t border-line flex flex-wrap items-center justify-between gap-4">
            <div className="font-mono text-xs text-ink-hush">
              © {new Date().getFullYear()} Veloseller — Inventory intelligence для ecommerce
            </div>
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-lime-deep animate-pulse" />
              <span className="font-mono text-xs text-ink-hush">все системы работают</span>
            </div>
          </div>
        </div>
      </footer>
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

function PricingCard({ name, price, skus, highlight, perks }: typeof plans[number]) {
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
        <span className="font-display text-5xl md:text-6xl tracking-tight text-ink tabular font-medium">${price}</span>
        <span className="text-ink-muted">/мес</span>
      </div>
      <div className="mt-1 font-mono text-xs text-ink-hush">до {skus} SKU</div>
      <ul className="mt-6 md:mt-7 space-y-3">
        {perks.map((perk) => (
          <li key={perk} className="flex items-start gap-2.5 text-sm md:text-[15px] text-ink-soft">
            <span className="text-lime-deep shrink-0 mt-0.5"><Icons.Check /></span>
            <span>{perk}</span>
          </li>
        ))}
      </ul>
      <Link
        href={"/register" as any}
        className={`mt-7 md:mt-8 block rounded-lg px-4 py-3 text-center text-sm font-semibold transition ${
          highlight
            ? "bg-ink text-paper hover:bg-ink-soft"
            : "bg-bg-soft text-ink border border-line hover:border-lime-deep/40"
        }`}
      >
        Начать бесплатно
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
  { label: "Точность TVelo", value: "+47", unit: "%", sub: "vs обычная velocity" },
  { label: "Среднее время сетапа", value: "5", unit: "мин", sub: "от регистрации до данных" },
  { label: "Источников данных", value: "5", sub: "Sheets, CSV, Ozon, WB, YML" },
  { label: "Метрик по каждому SKU", value: "23", sub: "включая confidence" },
];
const integrations = [
  { name: "Ozon",          tag: "API",       dot: "#005bff" },
  { name: "Wildberries",   tag: "API",       dot: "#a71179" },
  { name: "Google Sheets", tag: "READ-ONLY", dot: "#0F9D58" },
  { name: "CSV",           tag: "UPLOAD",    dot: "#525a4e" },
  { name: "YML feed",      tag: "FETCH",     dot: "#f97316" },
  { name: "Shopify",       tag: "SOON",      dot: "#95BF47" },
  { name: "Amazon SP-API", tag: "SOON",      dot: "#FF9900" },
  { name: "Telegram",      tag: "BOT",       dot: "#229ED9" },
  { name: "Resend",        tag: "EMAIL",     dot: "#000" },
];
const compareLeft = [
  "Считаешь velocity вручную раз в месяц",
  "Не учитываешь дни OOS — данные искажены",
  "Замечаешь дефицит, когда уже поздно",
  "Не видишь сколько денег зависло в мёртвых остатках",
  "Алерты приходят постфактум, через WhatsApp",
];
const compareRight = [
  "TVelo пересчитывается каждые 6 часов автоматически",
  "Вычитаем OOS дни — реальная velocity",
  "Сигнал на закупку за 7-14 дней до OOS",
  "Видишь точную сумму заморозки в неликвиде",
  "Telegram + email digest каждое утро",
];
const steps = [
  { title: "Подключи источник",     text: "Вставь ссылку на Google Sheet, загрузи CSV или подключи Ozon/WB через API-ключ." },
  { title: "Получи первый расчёт",   text: "Через 30 минут — первые TVelo и health score. Через 7 дней — все аналитики работают точно." },
  { title: "Действуй по сигналам",   text: "Email + Telegram digest каждое утро. Дашборд с приоритетами и калькулятор закупки." },
];
const testimonials = [
  { quote: "Наконец перестал считать velocity в Excel. Через неделю увидел, что 12% оборотных денег заморожено в неликвиде — закрыл закупку на пару SKU и освободил 380к.", name: "Артём Кузнецов", role: "Селлер на Ozon, 1200 SKU", initials: "АК", avatarBg: "#84cc16", avatarColor: "#0a0a08" },
  { quote: "TVelo показал, что половина моих медленных товаров на самом деле быстрые — просто часто уходили в OOS. Перезаказал — выручка +18% за месяц.", name: "Мария Логинова", role: "WB Premium, 3400 SKU", initials: "МЛ", avatarBg: "#0284c7", avatarColor: "#fff" },
  { quote: "Telegram-уведомления — главная фишка. Не сижу в дашборде. Приходит сигнал и пошёл, заказал, забыл.", name: "Дмитрий Беляев", role: "Multi-marketplace, 800 SKU", initials: "ДБ", avatarBg: "#ea580c", avatarColor: "#fff" },
];
const plans = [
  { name: "Starter", price: 24,  skus: "500",   highlight: false, perks: ["1 магазин", "Дашборд + базовая аналитика", "Email digest"] },
  { name: "Growth",  price: 89,  skus: "4 000", highlight: true,  perks: ["3 магазина", "Все источники данных", "Telegram + email digest", "Калькулятор закупки"] },
  { name: "Pro",     price: 299, skus: "10 000",highlight: false, perks: ["Безлимит магазинов", "Price elasticity", "Приоритетная поддержка", "API доступ"] },
];
