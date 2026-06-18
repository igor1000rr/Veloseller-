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
      <MarketingHeader />

      <section className="relative px-6 py-16 md:py-24">
        <div className="max-w-4xl mx-auto text-center">
          <Eyebrow>Партнёрская программа</Eyebrow>
          <h1 className="mt-4 font-display text-3xl sm:text-4xl md:text-6xl tracking-tight font-medium leading-[1.05]">
            Приводите клиентов — получайте {SHARE_PCT}% с их платежей. Пожизненно.
          </h1>
          <p className="mt-5 text-ink-muted text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Агентствам, консультантам и сервисам для селлеров: рекомендуйте Veloseller и зарабатывайте на каждом платеже клиента, пока он с нами.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href={MAILTO} className="rounded-lg bg-ink text-paper px-6 py-3 text-sm font-semibold hover:bg-ink-soft transition">
              Стать партнёром
            </a>
            <a href="#how" className="rounded-lg bg-bg-soft text-ink border border-line px-6 py-3 text-sm font-semibold hover:border-lime-deep/40 transition">
              Как это работает
            </a>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 font-mono text-xs uppercase tracking-wider text-ink-hush">
            <span>{SHARE_PCT}% пожизненно</span>
            <span>выплаты ежемесячно</span>
            <span>без потолка</span>
          </div>
        </div>
      </section>

      <section className="px-6 py-12 md:py-16 border-t border-line">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <Eyebrow>Кому подходит</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-4xl tracking-tight font-medium">
              Станьте нашим отделом продаж
            </h2>
            <p className="mt-3 text-ink-muted max-w-2xl mx-auto text-sm md:text-base">
              У нас нет огромного отдела продаж — зато есть вы. Кто приводит клиентов лучше всего:
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {SEGMENTS.map((s) => (
              <div key={s.title} className="rounded-2xl border border-line bg-paper p-6 hover:border-lime-deep/40 hover:shadow-lg transition">
                <h3 className="font-display text-lg leading-tight font-medium">{s.title}</h3>
                <p className="mt-2 text-sm text-ink-muted leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="px-6 py-12 md:py-16 border-t border-line bg-bg-soft">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <Eyebrow>Как это работает</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-4xl tracking-tight font-medium">
              Четыре шага до пассивного дохода
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-2xl border border-line bg-paper p-6">
                <span className="font-mono text-xs text-lime-deep">{s.n}</span>
                <h3 className="mt-3 font-display text-lg leading-tight font-medium">{s.title}</h3>
                <p className="mt-2 text-sm text-ink-muted leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-12 md:py-16 border-t border-line">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <Eyebrow>Сколько можно заработать</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-4xl tracking-tight font-medium">
              Доход, который повторяется каждый месяц
            </h2>
            <p className="mt-3 text-ink-muted max-w-2xl mx-auto text-sm md:text-base">
              Пример для клиентов с чеком {ruN(EXAMPLE_ARPU)} ₽/мес. Это recurring — сумма приходит каждый месяц, пока клиенты платят.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5">
            {SCENARIOS.map((n) => (
              <div key={n} className="rounded-2xl border border-line bg-paper p-6 text-center">
                <div className="font-mono text-xs uppercase tracking-wider text-ink-hush">{n} клиентов</div>
                <div className="mt-3 font-display text-3xl md:text-4xl tracking-tight font-medium tabular">
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

      <section className="px-6 py-12 md:py-16 border-t border-line bg-bg-soft">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <Eyebrow>Условия</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-4xl tracking-tight font-medium">
              Прозрачно и без мелкого шрифта
            </h2>
          </div>
          <ul className="space-y-3">
            {TERMS.map((item) => (
              <li key={item} className="flex items-start gap-3 rounded-xl border border-line bg-paper p-4">
                <span className="mt-0.5 shrink-0 text-lime-deep font-mono">✓</span>
                <span className="text-sm md:text-[15px] text-ink-soft leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="px-6 py-12 md:py-16 border-t border-line">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <Eyebrow>Почему это выгодно</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-4xl tracking-tight font-medium">
              Партнёрка, которая работает на вас
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
            {WHY.map((w) => (
              <div key={w.title} className="rounded-2xl border border-line bg-paper p-6 hover:border-lime-deep/40 hover:shadow-lg transition">
                <h3 className="font-display text-lg leading-tight font-medium">{w.title}</h3>
                <p className="mt-2 text-sm text-ink-muted leading-relaxed">{w.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-12 md:py-16 border-t border-line bg-bg-soft">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <Eyebrow>Вопросы</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-4xl tracking-tight font-medium">
              Частые вопросы
            </h2>
          </div>
          <div className="space-y-3">
            {FAQ.map((f) => (
              <details key={f.q} className="rounded-xl border border-line bg-paper p-4">
                <summary className="cursor-pointer list-none font-medium text-ink flex items-center justify-between gap-4">
                  <span>{f.q}</span>
                  <span className="text-ink-hush font-mono shrink-0">+</span>
                </summary>
                <p className="mt-3 text-sm text-ink-muted leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section id="apply" className="px-6 py-16 md:py-24 border-t border-line">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-display text-3xl md:text-5xl tracking-tight font-medium leading-tight">
            Готовы зарабатывать с нами?
          </h2>
          <p className="mt-4 text-ink-muted text-base md:text-lg leading-relaxed">
            Оставьте заявку — расскажем про условия, выдадим кабинет и реф-ссылку. Отвечаем в течение рабочего дня.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href={MAILTO} className="rounded-lg bg-ink text-paper px-6 py-3 text-sm font-semibold hover:bg-ink-soft transition">
              Оставить заявку
            </a>
            {PARTNER_TG ? (
              <a href={"https://t.me/" + PARTNER_TG} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-bg-soft text-ink border border-line px-6 py-3 text-sm font-semibold hover:border-lime-deep/40 transition">
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
