import type { Metadata } from "next";
import { Eyebrow, MarketingHeader, MarketingFooter } from "../_components/MarketingChrome";

export const metadata: Metadata = {
  title: "Партнёрская программа",
  description:
    "Приводите клиентов в Veloseller и получайте 20% с их платежей пожизненно. Программа для агентств, консультантов и сервисов для селлеров Wildberries и Ozon.",
};

// Предлагаемые условия — поправь под финальную оферту (всё в константах).
const SHARE_PCT = 20; // % с каждого платежа приведённого клиента
const COOKIE_DAYS = 60; // окно атрибуции по реф-ссылке
const MIN_PAYOUT = "5 000 ₽"; // минимальная сумма к выводу
const EXAMPLE_ARPU = 2500; // ₽/мес — пример чека клиента для расчёта дохода
const PARTNER_EMAIL = "partners@veloseller.ru";
const PARTNER_TG = ""; // впиши хэндл (напр. veloseller_partners) — появится кнопка Telegram

const MAILTO =
  "mailto:" + PARTNER_EMAIL + "?subject=" +
  encodeURIComponent("Заявка в партнёрскую программу Veloseller");

const ruN = (n: number) => n.toLocaleString("ru-RU");

// Литеральные классы — чтобы Tailwind их сгенерил (динамику purge не видит).
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

const SEGMENTS = [
  { title: "Агентства и подрядчики", text: "Ведёте селлеров на Wildberries и Ozon — зашейте Veloseller в свой пакет услуг и получайте долю с каждого клиента." },
  { title: "Консультанты и наставники", text: "Учите выходить на маркетплейсы и расти — рекомендуйте инструмент, который ученикам нужен каждый день." },
  { title: "Сервисы и SaaS для e-commerce", text: "Технологический или взаимный партнёр: дополните свой продукт аналитикой остатков и скорости продаж." },
  { title: "Блогеры и сообщества", text: "Пишете про торговлю на WB и Ozon — дайте аудитории полезный сервис и зарабатывайте на рекомендациях." },
];

const STEPS = [
  { n: "01", title: "Заявка и кабинет", text: "Оставляете заявку — открываем партнёрский кабинет с реф-ссылкой и промокодом." },
  { n: "02", title: "Рекомендуете", text: "Приводите клиентов по ссылке, промокоду или передаёте контакт менеджеру — фиксируем привязку." },
  { n: "03", title: "Клиент оплачивает", text: "Клиент регистрируется и подключает любой платный тариф Veloseller." },
  { n: "04", title: "Получаете " + SHARE_PCT + "%", text: "Вам идёт " + SHARE_PCT + "% с каждого его платежа — пожизненно, пока клиент с нами. Выплаты раз в месяц." },
];

const TERMS = [
  SHARE_PCT + "% со всех платежей клиента — пожизненно, а не только с первой оплаты.",
  "Привязка по реф-ссылке или промокоду (окно " + COOKIE_DAYS + " дней) либо вручную через менеджера.",
  "Работает на всех платных тарифах — помесячных и годовых.",
  "Выплаты раз в месяц, от " + MIN_PAYOUT + " к выводу — на карту, счёт или как самозанятому.",
  "Прозрачный кабинет: клики, регистрации, оплаты и начисления онлайн.",
  "Без потолка: сколько клиентов приведёте — столько и зарабатываете.",
];

const WHY = [
  { title: "Доход, а не разовая комиссия", text: "Клиент платит каждый месяц — и каждый месяц вы получаете долю. Портфель растёт, доход накапливается." },
  { title: "Низкий отток", text: "Контроль остатков нужен селлеру постоянно. Клиенты остаются надолго — выплаты идут долго." },
  { title: "Растёте вместе с клиентом", text: "Клиент перешёл на тариф выше — ваши проценты считаются от большей суммы." },
  { title: "Материалы и поддержка", text: "Дадим презентации, промо и помощь с онбордингом. Ваша задача — рекомендовать." },
];

const SCENARIOS = [5, 15, 30];

const FAQ = [
  { q: "Что значит «пожизненно»?", a: "Пока клиент на платном тарифе, вы получаете долю с каждого его платежа — каждый месяц, а не разово." },
  { q: "Когда и как выплаты?", a: "Раз в месяц при накоплении от " + MIN_PAYOUT + ". На карту, расчётный счёт или как самозанятому — по договору." },
  { q: "Как фиксируется мой клиент?", a: "По реф-ссылке или промокоду (окно " + COOKIE_DAYS + " дней). Если клиент пришёл напрямую — менеджер привяжет его к вам." },
  { q: "Клиент сделал апгрейд тарифа?", a: "Процент считается от фактической суммы платежа — стал платить больше, вознаграждение выросло." },
  { q: "Можно совмещать с моими услугами?", a: "Да. Агентства и консультанты включают Veloseller в свой пакет и зарабатывают и на услугах, и на партнёрке." },
  { q: "Как с налогами?", a: "Выплаты по договору — самозанятым, ИП или физлицу. Налоги вы декларируете самостоятельно." },
];

export default function PartnerPage() {
  return (
    <div className="relative min-h-screen bg-paper-warm text-ink overflow-x-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-noise opacity-100 mix-blend-multiply" />
      <div aria-hidden className="pointer-events-none fixed -top-40 -left-40 size-[700px] rounded-full blur-3xl opacity-50" style={{ background: "radial-gradient(closest-side, rgba(132,204,22,0.25), transparent 70%)" }} />
      <div aria-hidden className="pointer-events-none fixed -bottom-40 -right-40 size-[600px] rounded-full blur-3xl opacity-40" style={{ background: "radial-gradient(closest-side, rgba(2,132,199,0.15), transparent 70%)" }} />

      <MarketingHeader />

      <section className="relative px-6 py-16 md:py-24">
        <div className="max-w-4xl mx-auto text-center reveal">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-lime-deep/30 bg-lime-soft">
            <span className="size-1.5 rounded-full bg-lime-deep animate-pulse" />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime-deep font-semibold">Партнёрская программа</span>
          </span>
          <h1 className="mt-6 font-display text-3xl sm:text-4xl md:text-6xl tracking-tight font-medium leading-[1.05]">
            Приводите клиентов — получайте{" "}
            <span className="bg-gradient-to-r from-lime-deep to-azure bg-clip-text text-transparent">{SHARE_PCT}%</span>
            {" "}с их платежей. <span className="text-lime-deep">Пожизненно.</span>
          </h1>
          <p className="mt-5 text-ink-muted text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Агентствам, консультантам и сервисам для селлеров: рекомендуйте Veloseller и зарабатывайте на каждом платеже клиента, пока он с нами.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href={MAILTO} className="rounded-lg bg-ink text-paper px-6 py-3 text-sm font-semibold hover:bg-ink-soft transition shadow-[0_10px_30px_-10px_rgba(10,10,8,0.45)] hover:-translate-y-0.5">
              Стать партнёром
            </a>
            <a href="#how" className="rounded-lg bg-paper text-ink border border-line px-6 py-3 text-sm font-semibold hover:border-lime-deep/40 transition hover:-translate-y-0.5">
              Как это работает
            </a>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
            <span className="rounded-full bg-lime-soft text-lime-deep px-4 py-1.5 text-sm font-medium">{SHARE_PCT}% пожизненно</span>
            <span className="rounded-full bg-azure/10 text-azure px-4 py-1.5 text-sm font-medium">выплаты ежемесячно</span>
            <span className="rounded-full bg-orange/10 text-orange px-4 py-1.5 text-sm font-medium">без потолка</span>
          </div>
        </div>
      </section>

      <section className="relative px-6 py-12 md:py-16 border-t border-line">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10 reveal">
            <Eyebrow>Кому подходит</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-4xl tracking-tight font-medium">
              Станьте нашим отделом продаж
            </h2>
            <p className="mt-3 text-ink-muted max-w-2xl mx-auto text-sm md:text-base">
              У нас нет огромного отдела продаж — зато есть вы. Кто приводит клиентов лучше всего:
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {SEGMENTS.map((s, i) => {
              const a = ACCENTS[i % 4];
              return (
                <div key={s.title} className={"group reveal rounded-2xl border border-line bg-paper p-6 transition hover:-translate-y-1 hover:shadow-xl " + HOVER[a]} style={{ animationDelay: i * 80 + "ms" }}>
                  <div className={"flex size-11 items-center justify-center rounded-xl font-mono text-sm font-semibold transition group-hover:scale-110 " + CHIP[a]}>{String(i + 1).padStart(2, "0")}</div>
                  <h3 className="mt-5 font-display text-lg leading-tight font-medium">{s.title}</h3>
                  <p className="mt-2 text-sm text-ink-muted leading-relaxed">{s.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="how" className="relative px-6 py-12 md:py-16 border-t border-line bg-bg-soft">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10 reveal">
            <Eyebrow>Как это работает</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-4xl tracking-tight font-medium">
              Четыре шага до пассивного дохода
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {STEPS.map((s, i) => {
              const a = ACCENTS[i % 4];
              return (
                <div key={s.n} className="group reveal rounded-2xl border border-line bg-paper p-6 transition hover:-translate-y-1 hover:shadow-xl" style={{ animationDelay: i * 80 + "ms" }}>
                  <div className={"flex size-11 items-center justify-center rounded-xl font-mono text-sm font-semibold transition group-hover:scale-110 " + CHIP[a]}>{s.n}</div>
                  <h3 className="mt-5 font-display text-lg leading-tight font-medium">{s.title}</h3>
                  <p className="mt-2 text-sm text-ink-muted leading-relaxed">{s.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative px-6 py-12 md:py-16 border-t border-line">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10 reveal">
            <Eyebrow>Сколько можно заработать</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-4xl tracking-tight font-medium">
              Доход, который повторяется каждый месяц
            </h2>
            <p className="mt-3 text-ink-muted max-w-2xl mx-auto text-sm md:text-base">
              Пример для клиентов с чеком {ruN(EXAMPLE_ARPU)} ₽/мес. Это recurring — сумма приходит каждый месяц, пока клиенты платят.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5">
            {SCENARIOS.map((n, i) => (
              <div key={n} className="reveal rounded-2xl border border-line bg-gradient-to-br from-paper to-lime-soft p-6 text-center transition hover:-translate-y-1 hover:shadow-xl hover:border-lime-deep/40" style={{ animationDelay: i * 100 + "ms" }}>
                <div className="font-mono text-xs uppercase tracking-wider text-ink-hush">{n} клиентов</div>
                <div className="mt-3 font-display text-4xl md:text-5xl tracking-tight font-medium tabular bg-gradient-to-r from-lime-deep to-azure bg-clip-text text-transparent">
                  {ruN(Math.round(EXAMPLE_ARPU * (SHARE_PCT / 100) * n))} ₽
                </div>
                <div className="mt-1 text-sm text-ink-muted">в месяц, пожизненно</div>
              </div>
            ))}
          </div>
          <p className="mt-5 text-center font-mono text-xs text-ink-hush">
            Реальный доход зависит от тарифов клиентов и растёт при их апгрейде.
          </p>
        </div>
      </section>

      <section className="relative px-6 py-12 md:py-16 border-t border-line bg-bg-soft">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8 reveal">
            <Eyebrow>Условия</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-4xl tracking-tight font-medium">
              Прозрачно и без мелкого шрифта
            </h2>
          </div>
          <ul className="space-y-3">
            {TERMS.map((item, i) => (
              <li key={item} className="reveal flex items-start gap-3 rounded-xl border border-line bg-paper p-4 transition hover:border-lime-deep/40" style={{ animationDelay: i * 60 + "ms" }}>
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-lime-soft text-lime-deep font-mono text-xs">✓</span>
                <span className="text-sm md:text-[15px] text-ink-soft leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="relative px-6 py-12 md:py-16 border-t border-line">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10 reveal">
            <Eyebrow>Почему это выгодно</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-4xl tracking-tight font-medium">
              Партнёрка, которая работает на вас
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
            {WHY.map((w, i) => {
              const a = ACCENTS[i % 4];
              return (
                <div key={w.title} className={"group reveal rounded-2xl border border-line bg-paper p-6 transition hover:-translate-y-1 hover:shadow-xl " + HOVER[a]} style={{ animationDelay: i * 80 + "ms" }}>
                  <div className={"flex size-11 items-center justify-center rounded-xl font-mono text-sm font-semibold transition group-hover:scale-110 " + CHIP[a]}>{String(i + 1).padStart(2, "0")}</div>
                  <h3 className="mt-5 font-display text-lg leading-tight font-medium">{w.title}</h3>
                  <p className="mt-2 text-sm text-ink-muted leading-relaxed">{w.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative px-6 py-12 md:py-16 border-t border-line bg-bg-soft">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8 reveal">
            <Eyebrow>Вопросы</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-4xl tracking-tight font-medium">
              Частые вопросы
            </h2>
          </div>
          <div className="space-y-3">
            {FAQ.map((f, i) => (
              <details key={f.q} className="reveal group rounded-xl border border-line bg-paper p-4 transition hover:border-lime-deep/40" style={{ animationDelay: i * 60 + "ms" }}>
                <summary className="cursor-pointer list-none font-medium text-ink flex items-center justify-between gap-4">
                  <span>{f.q}</span>
                  <span className="text-lime-deep font-mono shrink-0 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm text-ink-muted leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section id="apply" className="relative px-6 py-16 md:py-24 border-t border-line">
        <div className="max-w-3xl mx-auto text-center reveal">
          <h2 className="font-display text-3xl md:text-5xl tracking-tight font-medium leading-tight">
            Готовы зарабатывать{" "}
            <span className="bg-gradient-to-r from-lime-deep to-azure bg-clip-text text-transparent">с нами</span>?
          </h2>
          <p className="mt-4 text-ink-muted text-base md:text-lg leading-relaxed">
            Оставьте заявку — расскажем про условия, выдадим кабинет и реф-ссылку. Отвечаем в течение рабочего дня.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href={MAILTO} className="rounded-lg bg-ink text-paper px-6 py-3 text-sm font-semibold hover:bg-ink-soft transition shadow-[0_10px_30px_-10px_rgba(10,10,8,0.45)] hover:-translate-y-0.5">
              Оставить заявку
            </a>
            {PARTNER_TG ? (
              <a href={"https://t.me/" + PARTNER_TG} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-paper text-ink border border-line px-6 py-3 text-sm font-semibold hover:border-lime-deep/40 transition hover:-translate-y-0.5">
                Написать в Telegram
              </a>
            ) : null}
          </div>
          <p className="mt-4 font-mono text-xs text-ink-hush">{PARTNER_EMAIL}</p>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
