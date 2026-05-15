import Link from "next/link";
import HeroVeloDemo from "./HeroVeloDemo";
import DashboardPreview from "./DashboardPreview";
import FaqAccordion from "./FaqAccordion";

export default function LandingPage() {
  return (
    <main className="relative bg-paper text-ink overflow-x-hidden">
      {/* фоновая декорация */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-noise opacity-100 mix-blend-multiply" />
      <div
        aria-hidden
        className="pointer-events-none fixed -top-40 -left-40 size-[700px] rounded-full blur-3xl opacity-50"
        style={{ background: "radial-gradient(closest-side, rgba(132,204,22,0.30), transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -bottom-40 -right-40 size-[600px] rounded-full blur-3xl opacity-40"
        style={{ background: "radial-gradient(closest-side, rgba(14,165,233,0.20), transparent 70%)" }}
      />

      {/* ======= HEADER ======= */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-paper/80 border-b border-line">
        <div className="w-full px-6 lg:px-12 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="font-display text-lg font-medium tracking-tight">
              Velo<span className="text-lime-deep">seller</span>
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-ink-soft hover:text-lime-deep transition">Возможности</a>
            <a href="#how" className="text-sm text-ink-soft hover:text-lime-deep transition">Как работает</a>
            <a href="#integrations" className="text-sm text-ink-soft hover:text-lime-deep transition">Интеграции</a>
            <a href="#pricing" className="text-sm text-ink-soft hover:text-lime-deep transition">Тарифы</a>
            <a href="#faq" className="text-sm text-ink-soft hover:text-lime-deep transition">FAQ</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href={"/login" as any} className="text-sm text-ink-soft hover:text-ink transition">
              Войти
            </Link>
            <Link
              href={"/register" as any}
              className="rounded-md bg-ink text-paper px-4 py-2 text-sm font-semibold hover:bg-ink-soft transition"
            >
              Начать
            </Link>
          </div>
        </div>
      </header>

      {/* ======= HERO ======= */}
      <section className="relative w-full px-6 lg:px-12 pt-16 pb-20 md:pt-24 md:pb-28">
        <div className="grid lg:grid-cols-12 gap-12 items-center max-w-[1600px] mx-auto">
          <div className="lg:col-span-6 reveal">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-lime-deep/30 bg-lime-soft">
              <span className="size-1.5 rounded-full bg-lime-deep animate-pulse" />
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime-deep font-semibold">
                Inventory intelligence · v1.0
              </span>
            </div>

            <h1 className="mt-6 font-display text-5xl md:text-6xl xl:text-7xl leading-[0.95] tracking-tight">
              Скорость продаж <span className="text-lime-deep">без вранья</span>
            </h1>

            <p className="mt-6 text-lg text-ink-muted max-w-xl leading-relaxed">
              Если ваш отчёт делит продажи на 30 дней — он лжёт. Мы вычитаем дни,
              когда товара не было на складе, и показываем{" "}
              <span className="text-ink font-medium">реальную скорость продаж</span> —
              ту, по которой можно планировать закупку.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href={"/register" as any}
                className="group relative inline-flex items-center gap-2 rounded-lg bg-ink text-paper px-6 py-3.5 font-semibold hover:bg-ink-soft transition shadow-[0_10px_30px_-10px_rgba(10,13,10,0.4)]"
              >
                Подключить магазин
                <span className="font-mono text-xs opacity-60">5 мин</span>
                <ArrowRight />
              </Link>
              <a href="#how" className="text-sm text-ink-muted hover:text-lime-deep transition">
                Как это работает →
              </a>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-hush font-mono">
              <span className="flex items-center gap-1.5"><Check /> 30 дней бесплатно</span>
              <span className="flex items-center gap-1.5"><Check /> Без карты</span>
              <span className="flex items-center gap-1.5"><Check /> Только чтение данных</span>
            </div>
          </div>

          <div className="lg:col-span-6 reveal" style={{ animationDelay: "120ms" }}>
            <HeroVeloDemo />
          </div>
        </div>
      </section>

      {/* ======= STATS ======= */}
      <section className="relative w-full px-6 lg:px-12 py-12 border-y border-line bg-bg-soft">
        <div className="max-w-[1600px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((s, i) => (
            <div key={i} className="relative">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush">{s.label}</div>
              <div className="mt-2 font-display text-4xl md:text-5xl tabular tracking-tight">
                {s.value}
                {s.unit && <span className="text-2xl text-ink-muted ml-1">{s.unit}</span>}
              </div>
              <div className="mt-1 text-xs text-ink-muted">{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ======= INTEGRATIONS marquee ======= */}
      <section id="integrations" className="relative w-full py-16 border-b border-line overflow-hidden">
        <div className="w-full px-6 lg:px-12 mb-10 max-w-[1600px] mx-auto">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">/ Integrations</span>
              <h2 className="mt-2 font-display text-3xl md:text-4xl tracking-tight">
                Подключается ко всему,<br/>где живут твои данные
              </h2>
            </div>
            <p className="text-ink-muted text-[15px] max-w-md">
              Read-only доступ через API маркетплейсов, или просто пришли CSV / поделись Google Sheet.
            </p>
          </div>
        </div>

        <div className="relative">
          <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-paper to-transparent z-10" />
          <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-paper to-transparent z-10" />
          <div className="flex marquee-track gap-4 w-max">
            {[...integrations, ...integrations].map((src, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-line bg-paper px-7 py-5 shrink-0 hover:border-lime-deep/40 transition">
                <span className="size-2.5 rounded-full" style={{ background: src.dot }} />
                <span className="font-display text-xl text-ink tracking-tight">{src.name}</span>
                <span className="font-mono text-[10px] text-ink-hush uppercase tracking-widest">{src.tag}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ======= DASHBOARD PREVIEW ======= */}
      <section className="relative w-full px-6 lg:px-12 py-24">
        <div className="max-w-[1600px] mx-auto">
          <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">/ Console</span>
              <h2 className="mt-2 font-display text-4xl md:text-5xl tracking-tight max-w-2xl">
                Не таблица. <span className="text-ink-hush">Командный центр.</span>
              </h2>
            </div>
            <p className="text-ink-muted max-w-md text-[15px]">
              Видишь сразу: что заканчивается, что зависло мёртвым грузом, и сколько
              теряешь каждый день из-за неправильной velocity.
            </p>
          </div>
          <DashboardPreview />
        </div>
      </section>

      {/* ======= BENTO FEATURES ======= */}
      <section id="features" className="relative w-full px-6 lg:px-12 py-24 border-t border-line bg-bg-soft">
        <div className="max-w-[1600px] mx-auto">
          <div className="text-center mb-14">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">/ Features</span>
            <h2 className="mt-2 font-display text-4xl md:text-5xl tracking-tight">
              Шесть вещей, которые экономят деньги
            </h2>
            <p className="mt-4 text-ink-muted max-w-2xl mx-auto">
              Не «решения для бизнеса», а конкретные расчёты по каждому SKU. Каждая цифра
              подкреплена методологией и confidence-показателем.
            </p>
          </div>

          {/* Bento grid: разные размеры */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 auto-rows-[minmax(180px,_auto)]">
            {/* Big card: TVelo */}
            <div className="md:col-span-2 md:row-span-2 rounded-2xl border border-line bg-paper p-8 hover:border-lime-deep/40 transition shadow-sm relative overflow-hidden">
              <div className="absolute -top-10 -right-10 size-48 rounded-full bg-lime-soft blur-2xl" />
              <div className="relative">
                <div className="flex items-center gap-3">
                  <div className="flex size-11 items-center justify-center rounded-lg bg-lime text-ink"><IconSpeed /></div>
                  <span className="font-mono text-[10px] text-ink-hush">01 · CORE</span>
                </div>
                <h3 className="mt-6 font-display text-3xl md:text-4xl tracking-tight">TVelo — честная velocity</h3>
                <p className="mt-3 text-ink-muted max-w-lg leading-relaxed">
                  Считает скорость продаж, вычитая дни OOS. Реальная картина: какой товар
                  продаётся быстро, какой — мёртв. Разница с обычным расчётом может достигать 50%.
                </p>
                <div className="mt-6 rounded-xl border border-line bg-bg-soft p-4 inline-flex items-center gap-4">
                  <div>
                    <div className="font-mono text-[10px] text-ink-hush">sales / period</div>
                    <div className="font-mono text-xl text-ink-hush tabular line-through decoration-orange/70 decoration-2">2.00</div>
                  </div>
                  <ArrowRight />
                  <div>
                    <div className="font-mono text-[10px] text-lime-deep font-semibold">TVelo</div>
                    <div className="font-mono text-xl text-ink tabular font-semibold">3.00 <span className="text-sm text-lime-deep">+50%</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Coverage */}
            <BentoCard
              idx="02"
              icon={<IconCoverage />}
              title="Дни покрытия"
              text="На сколько хватит остатков. Сигнал заранее, а не когда уже OOS."
              accent="azure"
            />
            {/* Health */}
            <BentoCard
              idx="03"
              icon={<IconHealth />}
              title="Health Score 0–100"
              text="Состояние склада одной цифрой. Дефицит, неликвид, тренд."
              accent="lime"
            />

            {/* Confidence */}
            <BentoCard
              idx="04"
              icon={<IconShield />}
              title="Confidence-брейкдаун"
              text="Видно насколько надёжна метрика. Аномалии, пополнения и пропуски — учтены."
              accent="lime"
            />
            {/* Alerts */}
            <BentoCard
              idx="05"
              icon={<IconBell />}
              title="Умные уведомления"
              text="Telegram и email. Только важное: скоро закончится, повторный OOS."
              accent="orange"
            />
            {/* Integrations */}
            <BentoCard
              idx="06"
              icon={<IconPlug />}
              title="5 источников данных"
              text="Sheets, CSV, Ozon, WB, YML feed. Read-only."
              accent="azure"
            />
          </div>
        </div>
      </section>

      {/* ======= СРАВНЕНИЕ ======= */}
      <section className="relative w-full px-6 lg:px-12 py-24 border-t border-line">
        <div className="max-w-[1600px] mx-auto">
          <div className="text-center mb-14">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">/ Compare</span>
            <h2 className="mt-2 font-display text-4xl md:text-5xl tracking-tight">
              Excel vs Veloseller
            </h2>
            <p className="mt-3 text-ink-muted">
              Что меняется, когда перестаёшь считать вручную
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="rounded-2xl border-2 border-line bg-bg-soft p-8 relative">
              <div className="absolute -top-3 left-7 px-2.5 py-0.5 rounded bg-paper border border-line-2">
                <span className="font-mono text-[10px] text-ink-hush uppercase tracking-widest">До</span>
              </div>
              <h3 className="font-display text-2xl mt-3 text-ink-muted">Excel-табличка</h3>
              <ul className="mt-5 space-y-3">
                {compareLeft.map((it) => (
                  <li key={it} className="flex items-start gap-3 text-ink-muted">
                    <Cross />
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border-2 border-lime-deep/50 bg-lime-soft p-8 relative shadow-[0_20px_60px_-20px_rgba(132,204,22,0.4)]">
              <div className="absolute -top-3 left-7 px-2.5 py-0.5 rounded bg-ink text-paper">
                <span className="font-mono text-[10px] uppercase tracking-widest">После</span>
              </div>
              <h3 className="font-display text-2xl mt-3 text-ink">Veloseller</h3>
              <ul className="mt-5 space-y-3">
                {compareRight.map((it) => (
                  <li key={it} className="flex items-start gap-3 text-ink-soft font-medium">
                    <Check />
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ======= HOW IT WORKS ======= */}
      <section id="how" className="relative w-full px-6 lg:px-12 py-24 border-t border-line bg-bg-soft">
        <div className="max-w-[1600px] mx-auto">
          <div className="text-center mb-16">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">/ How it works</span>
            <h2 className="mt-2 font-display text-4xl md:text-5xl tracking-tight">
              От Excel до решения — <span className="text-lime-deep">три шага</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {steps.map((s, i) => (
              <div key={i} className="relative rounded-2xl border border-line bg-paper p-7 hover:border-lime-deep/40 hover:shadow-lg transition">
                <div className="flex items-center justify-between">
                  <div className="font-display text-5xl text-lime-deep/80 tabular">0{i + 1}</div>
                  <span className="font-mono text-[10px] text-ink-hush uppercase tracking-widest">{s.detail}</span>
                </div>
                <h3 className="mt-5 font-display text-xl">{s.title}</h3>
                <p className="mt-3 text-sm text-ink-muted leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ======= TESTIMONIALS ======= */}
      <section className="relative w-full px-6 lg:px-12 py-24 border-t border-line">
        <div className="max-w-[1600px] mx-auto">
          <div className="text-center mb-14">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">/ Selled</span>
            <h2 className="mt-2 font-display text-4xl md:text-5xl tracking-tight">
              Селлеры о цифрах, которые увидели впервые
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {testimonials.map((t, i) => (
              <div key={i} className="rounded-2xl border border-line bg-paper p-7 hover:shadow-lg transition">
                <div className="flex items-center gap-1 text-lime-deep">
                  {[...Array(5)].map((_, j) => <Star key={j} />)}
                </div>
                <p className="mt-4 text-[15px] text-ink-soft leading-relaxed">«{t.quote}»</p>
                <div className="mt-6 flex items-center gap-3">
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

      {/* ======= PRICING ======= */}
      <section id="pricing" className="relative w-full px-6 lg:px-12 py-24 border-t border-line bg-bg-soft">
        <div className="max-w-[1600px] mx-auto">
          <div className="text-center mb-12">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">/ Pricing</span>
            <h2 className="mt-2 font-display text-4xl md:text-5xl tracking-tight">
              Простые тарифы. Никаких звёздочек.
            </h2>
            <p className="mt-3 text-ink-muted">Первый месяц бесплатно. Без карты.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {plans.map((p) => <PricingCard key={p.name} {...p} />)}
          </div>
          <p className="mt-10 text-center font-mono text-xs text-ink-hush">
            Все тарифы включают TVelo · Alerts · Дашборд · Email + Telegram digest
          </p>
        </div>
      </section>

      {/* ======= FAQ ======= */}
      <section id="faq" className="relative w-full px-6 lg:px-12 py-24 border-t border-line">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-14">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">/ FAQ</span>
            <h2 className="mt-2 font-display text-4xl md:text-5xl tracking-tight">
              Частые вопросы
            </h2>
          </div>
          <FaqAccordion />
        </div>
      </section>

      {/* ======= CTA ======= */}
      <section className="relative w-full px-6 lg:px-12 py-24">
        <div className="max-w-[1600px] mx-auto">
          <div className="relative overflow-hidden rounded-3xl border-2 border-lime-deep/30 bg-gradient-to-br from-lime-soft via-paper to-paper p-10 md:p-20">
            <div className="absolute -right-20 -top-20 size-80 rounded-full bg-lime/30 blur-3xl" />
            <div className="absolute -left-20 -bottom-20 size-60 rounded-full bg-azure/20 blur-3xl" />
            <div className="relative z-10 max-w-3xl">
              <h2 className="font-display text-4xl md:text-6xl tracking-tight leading-[1.05]">
                Перестань считать <span className="text-lime-deep">velocity вручную.</span>
              </h2>
              <p className="mt-5 text-ink-muted text-lg max-w-2xl leading-relaxed">
                Подключи источник данных — Google Sheet, CSV или API маркетплейса.
                Первый расчёт через 30 минут, точная аналитика через 7 дней.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Link
                  href={"/register" as any}
                  className="inline-flex items-center gap-2 rounded-lg bg-ink text-paper px-7 py-4 text-base font-semibold hover:bg-ink-soft transition shadow-[0_10px_30px_-10px_rgba(10,13,10,0.4)]"
                >
                  Начать бесплатно <ArrowRight />
                </Link>
                <a href="#pricing" className="inline-flex items-center px-7 py-4 text-ink-muted hover:text-lime-deep transition">
                  Посмотреть тарифы
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ======= FOOTER ======= */}
      <footer className="border-t border-line bg-bg-soft">
        <div className="max-w-[1600px] mx-auto w-full px-6 lg:px-12 py-16">
          <div className="grid md:grid-cols-12 gap-10">
            <div className="md:col-span-4">
              <div className="flex items-center gap-2.5">
                <Logo />
                <span className="font-display text-xl tracking-tight">Veloseller</span>
              </div>
              <p className="mt-5 text-sm text-ink-muted max-w-xs leading-relaxed">
                Inventory intelligence для маркетплейс-селлеров. TVelo, health score,
                confidence — расчёты, которым можно доверять.
              </p>
            </div>
            <div className="md:col-span-2">
              <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">Продукт</div>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li><a className="text-ink-soft hover:text-lime-deep transition" href="#features">Возможности</a></li>
                <li><a className="text-ink-soft hover:text-lime-deep transition" href="#how">Как работает</a></li>
                <li><a className="text-ink-soft hover:text-lime-deep transition" href="#pricing">Тарифы</a></li>
                <li><a className="text-ink-soft hover:text-lime-deep transition" href="#faq">FAQ</a></li>
              </ul>
            </div>
            <div className="md:col-span-2">
              <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">Интеграции</div>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li className="text-ink-soft">Ozon API</li>
                <li className="text-ink-soft">Wildberries API</li>
                <li className="text-ink-soft">Google Sheets</li>
                <li className="text-ink-soft">CSV upload</li>
              </ul>
            </div>
            <div className="md:col-span-2">
              <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">Аккаунт</div>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li><Link href={"/login" as any} className="text-ink-soft hover:text-lime-deep transition">Войти</Link></li>
                <li><Link href={"/register" as any} className="text-ink-soft hover:text-lime-deep transition">Регистрация</Link></li>
                <li><a className="text-ink-soft hover:text-lime-deep transition" href="#">Документация</a></li>
                <li><a className="text-ink-soft hover:text-lime-deep transition" href="#">Поддержка</a></li>
              </ul>
            </div>
            <div className="md:col-span-2">
              <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">Сообщество</div>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li><a className="text-ink-soft hover:text-lime-deep transition" href="#">Telegram</a></li>
                <li><a className="text-ink-soft hover:text-lime-deep transition" href="#">Email</a></li>
                <li><a className="text-ink-soft hover:text-lime-deep transition" href="#">GitHub</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-line flex flex-wrap items-center justify-between gap-4">
            <div className="font-mono text-xs text-ink-hush">
              © {new Date().getFullYear()} Veloseller · Inventory intelligence для ecommerce
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
// Sub-components
// ============================================================

function BentoCard({ idx, icon, title, text, accent }: {
  idx: string; icon: React.ReactNode; title: string; text: string;
  accent: "lime" | "azure" | "orange";
}) {
  const accentColor =
    accent === "lime"   ? "text-lime-deep bg-lime-soft" :
    accent === "azure"  ? "text-azure bg-azure/10" :
                          "text-orange bg-orange/10";
  return (
    <div className="rounded-2xl border border-line bg-paper p-7 hover:border-lime-deep/40 hover:shadow-lg transition group">
      <div className="flex items-center justify-between">
        <div className={`flex size-11 items-center justify-center rounded-lg ${accentColor} group-hover:scale-110 transition`}>
          {icon}
        </div>
        <span className="font-mono text-[10px] text-ink-hush tabular">{idx}</span>
      </div>
      <h3 className="mt-5 font-display text-xl leading-tight">{title}</h3>
      <p className="mt-2 text-sm text-ink-muted leading-relaxed">{text}</p>
    </div>
  );
}

function PricingCard({ name, price, skus, highlight, perks }: typeof plans[number]) {
  return (
    <div className={`relative rounded-2xl p-8 transition ${
      highlight
        ? "border-2 border-lime-deep bg-paper shadow-[0_20px_60px_-20px_rgba(132,204,22,0.4)]"
        : "border border-line bg-paper hover:shadow-lg"
    }`}>
      {highlight && (
        <span className="absolute -top-3 right-7 px-3 py-0.5 rounded-full bg-lime-deep text-paper font-mono text-[10px] uppercase tracking-widest">
          Популярный
        </span>
      )}
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">{name}</div>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="font-display text-6xl tracking-tight text-ink tabular">${price}</span>
        <span className="text-ink-muted">/мес</span>
      </div>
      <div className="mt-1 font-mono text-xs text-ink-hush">до {skus} SKU</div>
      <ul className="mt-7 space-y-3">
        {perks.map((perk) => (
          <li key={perk} className="flex items-start gap-2.5 text-[15px] text-ink-soft">
            <Check /> <span>{perk}</span>
          </li>
        ))}
      </ul>
      <Link
        href={"/register" as any}
        className={`mt-8 block rounded-lg px-4 py-3 text-center text-sm font-semibold transition ${
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

// ====== Icons ======
function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <rect x="2" y="2" width="24" height="24" rx="6" stroke="#4d7c0f" strokeWidth="1.5" fill="#84cc16" fillOpacity="0.15" />
      <path d="M7 18 L11 10 L14 16 L17 9 L21 18" stroke="#4d7c0f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="11" cy="10" r="1.3" fill="#4d7c0f" />
      <circle cx="17" cy="9" r="1.3" fill="#4d7c0f" />
    </svg>
  );
}
function ArrowRight() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 7h12m0 0L8 2m5 5l-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function Check() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-lime-deep shrink-0 mt-0.5"><path d="M2 7l3 3 7-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function Cross() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-rose shrink-0 mt-0.5"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>;
}
function Star() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M7 1l1.8 4 4.2.4-3.2 2.8 1 4.2L7 10.4 3.2 12.4l1-4.2L1 5.4 5.2 5z"/></svg>;
}
function IconSpeed() { return <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6"/><path d="M10 6v4l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>; }
function IconShield() { return <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2L3 4.5v5c0 4.5 3 7.5 7 8.5 4-1 7-4 7-8.5v-5L10 2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IconCoverage() { return <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="4" width="14" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.6"/><path d="M3 8h14M7 12l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IconHealth() { return <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M2 10h3l2-5 2 10 2-5h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IconBell() { return <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 9a5 5 0 1110 0v4l1.5 2H3.5L5 13V9zM8 18h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IconPlug() { return <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M7 2v3M13 2v3M6 5h8v4a4 4 0 11-8 0V5zM10 13v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>; }

// ============================================================
// Content data
// ============================================================

const stats = [
  { label: "Точность TVelo", value: "+47", unit: "%", sub: "vs обычная velocity" },
  { label: "Среднее время сетапа", value: "5", unit: "мин", sub: "от регистрации до данных" },
  { label: "Источников данных", value: "5", sub: "Sheets, CSV, Ozon, WB, YML" },
  { label: "Метрик по каждому SKU", value: "23", sub: "включая confidence" },
];

const integrations = [
  { name: "Ozon",         tag: "API",       dot: "#005bff" },
  { name: "Wildberries",  tag: "API",       dot: "#a71179" },
  { name: "Google Sheets",tag: "READ-ONLY", dot: "#0F9D58" },
  { name: "CSV",          tag: "UPLOAD",    dot: "#525a4e" },
  { name: "YML feed",     tag: "FETCH",     dot: "#f97316" },
  { name: "Telegram",     tag: "BOT",       dot: "#229ED9" },
  { name: "Resend",       tag: "EMAIL",     dot: "#000" },
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
  { title: "Подключи источник", text: "Вставь ссылку на Google Sheet, загрузи CSV или подключи Ozon/WB через API-ключ.", detail: "step 01" },
  { title: "Получи первый расчёт", text: "Через 30 минут — первые TVelo и health score. Через 7 дней — все аналитики работают точно.", detail: "step 02" },
  { title: "Действуй по сигналам", text: "Email + Telegram digest каждое утро. Дашборд с приоритетами и калькулятор закупки.", detail: "step 03" },
];

const testimonials = [
  {
    quote: "Наконец перестал считать velocity в Excel. Через неделю увидел, что 12% оборотных денег заморожено в неликвиде — закрыл закупку на пару SKU и освободил 380к.",
    name: "Артём Кузнецов",
    role: "Селлер на Ozon · 1200 SKU",
    initials: "АК",
    avatarBg: "#84cc16",
    avatarColor: "#0a0d0a",
  },
  {
    quote: "TVelo показал, что половина моих \"медленных\" товаров на самом деле быстрые — просто часто уходили в OOS. Перезаказал — выручка +18% за месяц.",
    name: "Мария Логинова",
    role: "WB Premium · 3400 SKU",
    initials: "МЛ",
    avatarBg: "#0ea5e9",
    avatarColor: "#fff",
  },
  {
    quote: "Telegram-уведомления — главная фишка. Не сижу в дашборде. Приходит сигнал «через 7 дней закончится X» — пошёл, заказал, забыл.",
    name: "Дмитрий Беляев",
    role: "Multi-marketplace · 800 SKU",
    initials: "ДБ",
    avatarBg: "#f97316",
    avatarColor: "#fff",
  },
];

const plans = [
  {
    name: "Starter",
    price: 24,
    skus: "500",
    highlight: false,
    perks: ["1 магазин", "Дашборд + базовая аналитика", "Email digest"],
  },
  {
    name: "Growth",
    price: 89,
    skus: "4 000",
    highlight: true,
    perks: ["3 магазина", "Все источники данных", "Telegram + email digest", "Калькулятор закупки"],
  },
  {
    name: "Pro",
    price: 299,
    skus: "10 000",
    highlight: false,
    perks: ["Безлимит магазинов", "Price elasticity (Rule 12.x)", "Приоритетная поддержка", "API доступ"],
  },
];
