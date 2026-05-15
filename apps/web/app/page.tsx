import Link from "next/link";
import HeroVeloDemo from "./HeroVeloDemo";
import DashboardPreview from "./DashboardPreview";

export default function LandingPage() {
  return (
    <main className="relative bg-ink-900 text-mist-50 overflow-x-hidden">
      {/* фоновые слои */}
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-grid-dark opacity-40" />
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-grain opacity-50 mix-blend-overlay" />
      <div
        aria-hidden
        className="pointer-events-none fixed -top-40 -left-40 size-[700px] rounded-full blur-3xl opacity-30"
        style={{ background: "radial-gradient(closest-side, rgba(163,230,53,0.35), transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -bottom-40 -right-40 size-[600px] rounded-full blur-3xl opacity-25"
        style={{ background: "radial-gradient(closest-side, rgba(251,146,60,0.30), transparent 70%)" }}
      />

      {/* ===== Header ===== */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-ink-900/70 border-b border-ink-700">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <Logo />
            <span className="font-display text-lg font-medium tracking-tight">
              Velo<span className="text-lime">seller</span>
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-7">
            <a href="#what" className="text-sm text-mist-200 hover:text-lime transition">Возможности</a>
            <a href="#how" className="text-sm text-mist-200 hover:text-lime transition">Как работает</a>
            <a href="#pricing" className="text-sm text-mist-200 hover:text-lime transition">Тарифы</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href={"/login" as any} className="text-sm text-mist-200 hover:text-mist-50 transition">
              Войти
            </Link>
            <Link
              href={"/register" as any}
              className="rounded-md bg-lime text-ink-900 px-4 py-2 text-sm font-semibold hover:bg-lime-bright transition"
            >
              Начать
            </Link>
          </div>
        </div>
      </header>

      {/* ===== Hero ===== */}
      <section className="relative mx-auto max-w-7xl px-6 pt-16 pb-24 md:pt-24 md:pb-32">
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          {/* Left: текст */}
          <div className="lg:col-span-6 reveal">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-lime/30 bg-lime/[0.06]">
              <span className="size-1.5 rounded-full bg-lime animate-pulse" />
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime">
                Inventory intelligence · v1.0
              </span>
            </div>

            <h1 className="mt-6 font-display text-5xl md:text-6xl lg:text-7xl leading-[0.95] tracking-tight">
              Скорость продаж{" "}
              <span className="text-lime">без вранья</span>
            </h1>

            <p className="mt-6 text-lg text-mist-200 max-w-xl leading-relaxed">
              Если ваш отчёт делит продажи на 30 дней — он лжёт. Мы вычитаем дни,
              когда товара не было на складе, и показываем{" "}
              <span className="text-mist-50">реальную скорость продаж</span> —
              ту, по которой можно планировать закупку.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href={"/register" as any}
                className="group relative inline-flex items-center gap-2 rounded-lg bg-lime text-ink-900 px-6 py-3.5 font-semibold hover:bg-lime-bright transition shadow-lg shadow-lime/20"
              >
                Подключить магазин
                <span className="font-mono text-xs opacity-60">5 мин</span>
                <ArrowRight />
              </Link>
              <a href="#how" className="text-sm text-mist-200 hover:text-lime transition">
                Как это работает →
              </a>
            </div>

            <div className="mt-6 flex items-center gap-6 text-xs text-mist-400 font-mono">
              <span className="flex items-center gap-1.5"><Check /> 30 дней бесплатно</span>
              <span className="flex items-center gap-1.5"><Check /> Без карты</span>
              <span className="flex items-center gap-1.5"><Check /> Только чтение</span>
            </div>
          </div>

          {/* Right: live demo */}
          <div className="lg:col-span-6 reveal" style={{ animationDelay: "120ms" }}>
            <HeroVeloDemo />
          </div>
        </div>

        {/* Лента «социальное доказательство» */}
        <div className="mt-20 border-y border-ink-700 py-6">
          <div className="flex flex-wrap items-center justify-between gap-y-4 gap-x-10">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-mist-400">
              Источники данных
            </span>
            {["Ozon", "Wildberries", "Google Sheets", "CSV upload", "YML feed"].map((src) => (
              <span key={src} className="font-display text-xl text-mist-200/80 tracking-tight">
                {src}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Дашборд preview ===== */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime">/ Console</span>
            <h2 className="mt-2 font-display text-4xl md:text-5xl tracking-tight max-w-2xl">
              Не таблица.{" "}
              <span className="text-mist-400">Командный центр.</span>
            </h2>
          </div>
          <p className="text-mist-200 max-w-md text-[15px]">
            Видишь сразу: что заканчивается, что зависло мёртвым грузом, и сколько
            теряешь каждый день из-за неправильной velocity.
          </p>
        </div>
        <DashboardPreview />
      </section>

      {/* ===== Features ===== */}
      <section id="what" className="mx-auto max-w-7xl px-6 py-24 border-t border-ink-700">
        <div className="grid lg:grid-cols-12 gap-10">
          <div className="lg:col-span-4">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime">/ Features</span>
            <h2 className="mt-2 font-display text-4xl md:text-5xl tracking-tight">
              Шесть вещей,<br/>которые экономят деньги
            </h2>
            <p className="mt-5 text-mist-200 leading-relaxed">
              Не «решения для бизнеса», а конкретные расчёты по каждому SKU.
              Каждая цифра подкреплена методологией и confidence-показателем.
            </p>
          </div>
          <div className="lg:col-span-8 grid sm:grid-cols-2 gap-3">
            {features.map((f, i) => (
              <FeatureCard key={f.title} {...f} idx={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ===== Как работает ===== */}
      <section id="how" className="mx-auto max-w-7xl px-6 py-24 border-t border-ink-700">
        <div className="text-center mb-16">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime">/ How it works</span>
          <h2 className="mt-2 font-display text-4xl md:text-5xl tracking-tight">
            От Excel до решения — <span className="text-lime">три шага</span>
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {steps.map((s, i) => (
            <div key={i} className="relative rounded-xl border border-ink-700 bg-ink-800 p-7 hover:border-lime/40 transition">
              <div className="absolute -top-3 left-7 px-2 py-0.5 rounded bg-ink-900 border border-ink-700">
                <span className="font-mono text-[10px] text-lime">STEP 0{i + 1}</span>
              </div>
              <h3 className="mt-3 font-display text-xl">{s.title}</h3>
              <p className="mt-3 text-sm text-mist-200 leading-relaxed">{s.text}</p>
              <div className="mt-5 font-mono text-[11px] text-mist-400">
                {s.detail}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Pricing ===== */}
      <section id="pricing" className="mx-auto max-w-7xl px-6 py-24 border-t border-ink-700">
        <div className="text-center mb-12">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime">/ Pricing</span>
          <h2 className="mt-2 font-display text-4xl md:text-5xl tracking-tight">
            Простые тарифы
          </h2>
          <p className="mt-3 text-mist-200">Первый месяц бесплатно. Без карты.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((p) => (
            <PricingCard key={p.name} {...p} />
          ))}
        </div>
        <p className="mt-10 text-center font-mono text-xs text-mist-400">
          Все тарифы включают TVelo, alerts, дашборд, email + telegram digest
        </p>
      </section>

      {/* ===== CTA ===== */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="relative overflow-hidden rounded-2xl border border-lime/30 bg-lime/[0.04] p-10 md:p-16">
          <div className="absolute -right-20 -top-20 size-60 rounded-full bg-lime/20 blur-3xl" />
          <div className="relative z-10 max-w-3xl">
            <h2 className="font-display text-4xl md:text-5xl tracking-tight">
              Перестань считать velocity вручную.
            </h2>
            <p className="mt-4 text-mist-200 text-lg max-w-2xl">
              Подключи источник данных — Google Sheet, CSV или API маркетплейса.
              Первый расчёт получишь через 30 минут, точную аналитику — через 7 дней.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href={"/register" as any}
                className="inline-flex items-center gap-2 rounded-lg bg-lime text-ink-900 px-6 py-3.5 font-semibold hover:bg-lime-bright transition"
              >
                Начать бесплатно <ArrowRight />
              </Link>
              <a href="#pricing" className="inline-flex items-center px-6 py-3.5 text-mist-200 hover:text-lime transition">
                Посмотреть тарифы
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="border-t border-ink-700 mt-10">
        <div className="mx-auto max-w-7xl px-6 py-10 flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="font-display text-base tracking-tight">Veloseller</span>
          </div>
          <div className="font-mono text-xs text-mist-400">
            © {new Date().getFullYear()} · Inventory intelligence для ecommerce
          </div>
          <div className="flex items-center gap-5 text-sm text-mist-400">
            <Link href={"/login" as any} className="hover:text-lime transition">Войти</Link>
            <Link href={"/register" as any} className="hover:text-lime transition">Регистрация</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

// ============================================================
// Sub-components
// ============================================================

function FeatureCard({ title, text, icon, idx }: typeof features[number] & { idx: number }) {
  return (
    <div className="group relative rounded-xl border border-ink-700 bg-ink-800/60 p-6 hover:border-lime/40 hover:bg-ink-700/60 transition">
      <div className="flex items-start justify-between">
        <div className="flex size-10 items-center justify-center rounded-md border border-ink-600 bg-ink-900 text-lime group-hover:border-lime/50 transition">
          {icon}
        </div>
        <span className="font-mono text-[10px] text-mist-400">0{idx + 1}</span>
      </div>
      <h3 className="mt-5 font-display text-lg leading-tight">{title}</h3>
      <p className="mt-2 text-sm text-mist-200 leading-relaxed">{text}</p>
    </div>
  );
}

function PricingCard({ name, price, skus, highlight, perks }: typeof plans[number]) {
  return (
    <div className={`relative rounded-2xl border p-7 ${
      highlight
        ? "border-lime/50 bg-lime/[0.04] shadow-xl shadow-lime/10"
        : "border-ink-700 bg-ink-800"
    }`}>
      {highlight && (
        <span className="absolute -top-3 right-7 px-2.5 py-0.5 rounded-full bg-lime text-ink-900 font-mono text-[10px] uppercase tracking-widest">
          Популярный
        </span>
      )}
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime">{name}</div>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="font-display text-5xl tracking-tight text-mist-50 tabular">${price}</span>
        <span className="text-mist-400">/мес</span>
      </div>
      <div className="mt-1 font-mono text-xs text-mist-400">до {skus} SKU</div>
      <ul className="mt-6 space-y-2.5">
        {perks.map((perk) => (
          <li key={perk} className="flex items-start gap-2.5 text-sm text-mist-200">
            <Check />
            <span>{perk}</span>
          </li>
        ))}
      </ul>
      <Link
        href={"/register" as any}
        className={`mt-7 block rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition ${
          highlight
            ? "bg-lime text-ink-900 hover:bg-lime-bright"
            : "bg-ink-900 text-mist-50 border border-ink-600 hover:border-lime/40"
        }`}
      >
        Начать бесплатно
      </Link>
    </div>
  );
}

// Icons (inline SVG чтобы не тянуть библиотеку)
function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <rect x="2" y="2" width="24" height="24" rx="6" stroke="#a3e635" strokeWidth="1.5" />
      <path d="M7 18 L11 10 L14 16 L17 9 L21 18" stroke="#a3e635" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="11" cy="10" r="1.3" fill="#d4ff5c" />
      <circle cx="17" cy="9" r="1.3" fill="#d4ff5c" />
    </svg>
  );
}
function ArrowRight() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 7h12m0 0L8 2m5 5l-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function Check() {
  return <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-lime shrink-0"><path d="M2 7l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function IconSpeed() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5"/><path d="M9 5v4l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}
function IconShield() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 1.5L2 4v5c0 4 3 6.5 7 7.5 4-1 7-3.5 7-7.5V4l-7-2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M6 9l2.5 2.5L12 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function IconCoverage() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="3" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="M2 7h14M6 11l1.5 1.5L11 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function IconHealth() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 9h3l2-5 2 10 2-5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function IconBell() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 8a5 5 0 1110 0v4l1.5 2H2.5L4 12V8zM7 16h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function IconPlug() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M6 2v3M12 2v3M5 5h8v4a4 4 0 11-8 0V5zM9 13v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

// ============================================================
// Content
// ============================================================

const features = [
  {
    title: "TVelo — честная velocity",
    text: "Считает скорость продаж, вычитая дни OOS. Реальная картина: какой товар продаётся быстро, какой — мёртв.",
    icon: <IconSpeed />,
  },
  {
    title: "Дни покрытия",
    text: "На сколько дней хватит остатков по текущей скорости. Сигнал на закупку заранее, а не когда уже OOS.",
    icon: <IconCoverage />,
  },
  {
    title: "Health Score 0–100",
    text: "Состояние склада в одной цифре. Учитывает дефицит, неликвид, избыточные остатки и тренд.",
    icon: <IconHealth />,
  },
  {
    title: "Confidence по каждой метрике",
    text: "Видишь, насколько надёжен расчёт. Аномалии, пополнения и пропуски учтены и видны в брейкдауне.",
    icon: <IconShield />,
  },
  {
    title: "Умные уведомления",
    text: "Telegram и email. Только то, что важно: скоро закончится, повторный OOS, аномальный спрос.",
    icon: <IconBell />,
  },
  {
    title: "5 источников данных",
    text: "Google Sheet, CSV, Ozon, Wildberries, XML/YML feed. Только чтение — никаких write-доступов.",
    icon: <IconPlug />,
  },
];

const steps = [
  {
    title: "Подключи источник",
    text: "5 минут: вставь ссылку на Google Sheet, загрузи CSV или подключи Ozon/WB через API-ключ.",
    detail: "→ 5 источников, только read-доступ",
  },
  {
    title: "Получи первый расчёт",
    text: "Через 30 минут — первые TVelo и health score. Через 7 дней — все аналитики работают точно.",
    detail: "→ обновление каждые 6 часов",
  },
  {
    title: "Действуй по сигналам",
    text: "Email + Telegram digest каждое утро. Дашборд с приоритетами и калькулятор закупки.",
    detail: "→ интеграция с любым стэком",
  },
];

const plans = [
  {
    name: "Starter",
    price: 24,
    skus: "500",
    highlight: false,
    perks: [
      "1 магазин",
      "Дашборд + базовая аналитика",
      "Email digest",
    ],
  },
  {
    name: "Growth",
    price: 89,
    skus: "4 000",
    highlight: true,
    perks: [
      "3 магазина",
      "Все источники данных",
      "Telegram + email digest",
      "Калькулятор закупки",
    ],
  },
  {
    name: "Pro",
    price: 299,
    skus: "10 000",
    highlight: false,
    perks: [
      "Безлимит магазинов",
      "Price elasticity (Rule 12.x)",
      "Приоритетная поддержка",
      "API доступ",
    ],
  },
];
