import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import LandingHeader from "../_landing/Header";
import LandingFooter from "../_landing/Footer";
import ScrollToTopButton from "../_components/ScrollToTopButton";
import PartnerCalculator from "../_components/PartnerCalculator";
import PartnerDashboard from "../_components/PartnerDashboard";
import { MIcon } from "../_components/MarketingIcons";
import { Eyebrow } from "../_landing/ui";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Партнёрская программа",
  description:
    "Приводите клиентов в Veloseller и получайте 20% с их платежей пожизненно. Программа для агентств, консультантов и сервисов для селлеров Wildberries и Ozon.",
};

const SHARE_PCT = 20;
const COOKIE_DAYS = 60;
const MIN_PAYOUT = "5 000 ₽";
const PARTNER_EMAIL = "partners@veloseller.ru";
const PARTNER_TG = ""; // впиши хэндл (напр. veloseller_partners) — появится кнопка Telegram

const MAILTO =
  "mailto:" + PARTNER_EMAIL + "?subject=" +
  encodeURIComponent("Заявка в партнёрскую программу Veloseller");

const ACCENTS = ["lime", "azure", "emerald", "orange"];
// Градиентная плитка под иконку (белая иконка на цвете).
const TILE: Record<string, string> = {
  lime: "bg-gradient-to-br from-lime-deep to-emerald",
  azure: "bg-gradient-to-br from-azure to-lime-deep",
  emerald: "bg-gradient-to-br from-emerald to-azure",
  orange: "bg-gradient-to-br from-orange to-rose",
};
// Лёгкая подложка карточки в тон акценту.
const TINT: Record<string, string> = {
  lime: "from-paper to-lime-soft",
  azure: "from-paper to-azure/10",
  emerald: "from-paper to-emerald/10",
  orange: "from-paper to-orange/10",
};
const HOVER: Record<string, string> = {
  lime: "hover:border-lime-deep/40",
  azure: "hover:border-azure/40",
  emerald: "hover:border-emerald/40",
  orange: "hover:border-orange/40",
};

const MARQUEE = [
  { icon: "box", label: "Ozon FBO/FBS" },
  { icon: "box", label: "Wildberries" },
  { icon: "doc", label: "Google Sheets" },
  { icon: "bell", label: "Алерты в Telegram" },
  { icon: "chart", label: "TVelo · скорость продаж" },
  { icon: "trend", label: "Прогноз нехватки" },
  { icon: "link", label: "Реф-ссылка и промокод" },
  { icon: "coins", label: "Выплаты ежемесячно" },
];

const SEGMENTS = [
  { icon: "briefcase", title: "Агентства и подрядчики", text: "Ведёте селлеров на Wildberries и Ozon — зашейте Veloseller в свой пакет услуг и получайте долю с каждого клиента." },
  { icon: "cap", title: "Консультанты и наставники", text: "Учите выходить на маркетплейсы и расти — рекомендуйте инструмент, который ученикам нужен каждый день." },
  { icon: "plug", title: "Сервисы и SaaS для e-commerce", text: "Технологический или взаимный партнёр: дополните свой продукт аналитикой остатков и скорости продаж." },
  { icon: "megaphone", title: "Блогеры и сообщества", text: "Пишете про торговлю на WB и Ozon — дайте аудитории полезный сервис и зарабатывайте на рекомендациях." },
];

const STEPS = [
  { icon: "doc", n: "01", title: "Заявка и кабинет", text: "Оставляете заявку — открываем партнёрский кабинет с реф-ссылкой и промокодом." },
  { icon: "link", n: "02", title: "Рекомендуете", text: "Приводите клиентов по ссылке, промокоду или передаёте контакт менеджеру — фиксируем привязку." },
  { icon: "card", n: "03", title: "Клиент оплачивает", text: "Клиент регистрируется и подключает любой платный тариф Veloseller." },
  { icon: "coins", n: "04", title: "Получаете " + SHARE_PCT + "%", text: "Вам идёт " + SHARE_PCT + "% с каждого его платежа — пожизненно, пока клиент с нами." },
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
  { icon: "refresh", title: "Доход, а не разовая комиссия", text: "Клиент платит каждый месяц — и каждый месяц вы получаете долю. Портфель растёт, доход накапливается." },
  { icon: "shield", title: "Низкий отток", text: "Контроль остатков нужен селлеру постоянно. Клиенты остаются надолго — выплаты идут долго." },
  { icon: "trend", title: "Растёте вместе с клиентом", text: "Клиент перешёл на тариф выше — ваши проценты считаются от большей суммы." },
  { icon: "spark", title: "Материалы и поддержка", text: "Дадим презентации, промо и помощь с онбордингом. Ваша задача — рекомендовать." },
];

const FAQ = [
  { q: "Что значит «пожизненно»?", a: "Пока клиент на платном тарифе, вы получаете долю с каждого его платежа — каждый месяц, а не разово." },
  { q: "Когда и как выплаты?", a: "Раз в месяц при накоплении от " + MIN_PAYOUT + ". На карту, расчётный счёт или как самозанятому — по договору." },
  { q: "Как фиксируется мой клиент?", a: "По реф-ссылке или промокоду (окно " + COOKIE_DAYS + " дней). Если клиент пришёл напрямую — менеджер привяжет его к вам." },
  { q: "Клиент сделал апгрейд тарифа?", a: "Процент считается от фактической суммы платежа — стал платить больше, вознаграждение выросло." },
  { q: "Можно совмещать с моими услугами?", a: "Да. Агентства и консультанты включают Veloseller в свой пакет и зарабатывают и на услугах, и на партнёрке." },
  { q: "Как с налогами?", a: "Выплаты по договору — самозанятым, ИП или физлицу. Налоги вы декларируете самостоятельно." },
];

const STEPLINE: Record<string, string> = {
  lime: "from-lime-deep to-emerald",
  azure: "from-azure to-lime-deep",
  emerald: "from-emerald to-azure",
  orange: "from-orange to-rose",
};

export default async function PartnerPage() {
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
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-12 items-center max-w-[1600px] mx-auto">
          <div className="lg:col-span-7 reveal">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-lime-deep/30 bg-lime-soft">
              <span className="size-1.5 rounded-full bg-lime-deep animate-pulse" />
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime-deep font-semibold">Партнёрская программа</span>
            </span>
            <h1 className="mt-6 font-display text-4xl sm:text-5xl md:text-6xl tracking-tight font-medium leading-[1.02]">
              Приводите клиентов — получайте{" "}
              <span className="bg-gradient-to-r from-lime-deep to-azure bg-clip-text text-transparent">{SHARE_PCT}%</span>
              {" "}с их платежей. <span className="text-lime-deep italic">Пожизненно.</span>
            </h1>
            <p className="mt-6 text-ink-muted text-base md:text-lg max-w-xl leading-relaxed">
              Агентствам, консультантам и сервисам для селлеров: рекомендуйте Veloseller и зарабатывайте на каждом платеже клиента, пока он с нами.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href={MAILTO} className="rounded-lg bg-ink text-paper px-6 py-3.5 text-sm font-semibold hover:bg-ink-soft transition shadow-[0_10px_30px_-10px_rgba(10,10,8,0.45)] hover:-translate-y-0.5">
                Стать партнёром
              </a>
              <a href="#calc" className="rounded-lg bg-paper text-ink border border-line px-6 py-3.5 text-sm font-semibold hover:border-lime-deep/40 transition hover:-translate-y-0.5">
                Посчитать доход
              </a>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-2.5">
              <span className="rounded-full bg-lime-soft text-lime-deep px-4 py-1.5 text-sm font-medium">{SHARE_PCT}% пожизненно</span>
              <span className="rounded-full bg-azure/10 text-azure px-4 py-1.5 text-sm font-medium">выплаты ежемесячно</span>
              <span className="rounded-full bg-orange/10 text-orange px-4 py-1.5 text-sm font-medium">без потолка</span>
            </div>
          </div>
          <div className="lg:col-span-5 reveal" style={{ animationDelay: "140ms" }}>
            <PartnerDashboard />
          </div>
        </div>
      </section>

      <div aria-hidden className="relative w-full border-y border-line bg-bg-soft py-5 overflow-hidden">
        <div className="flex w-max gap-3 marquee-track">
          {[...MARQUEE, ...MARQUEE].map((m, i) => (
            <span key={i} className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-paper px-4 py-2 text-sm text-ink-soft">
              <MIcon name={m.icon} className="size-4 text-lime-deep" />
              {m.label}
            </span>
          ))}
        </div>
      </div>

      <section className="relative w-full px-4 md:px-8 lg:px-12 py-12 md:py-16 border-t border-line">
        <div className="max-w-[1600px] mx-auto">
          <div className="text-center mb-10 md:mb-14 reveal">
            <Eyebrow center>Кому подходит</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-5xl tracking-tight font-medium">
              Станьте нашим отделом продаж
            </h2>
            <p className="mt-4 text-ink-muted max-w-2xl mx-auto text-sm md:text-base">
              У нас нет огромного отдела продаж — зато есть вы. Кто приводит клиентов лучше всего:
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {SEGMENTS.map((s, i) => {
              const a = ACCENTS[i % 4];
              return (
                <div key={s.title} className={"group reveal rounded-2xl border border-line bg-gradient-to-br p-5 sm:p-6 md:p-7 transition hover:-translate-y-1 hover:shadow-xl " + TINT[a] + " " + HOVER[a]} style={{ animationDelay: i * 80 + "ms" }}>
                  <div className={"flex size-12 items-center justify-center rounded-2xl text-paper shadow-md transition group-hover:scale-110 group-hover:-rotate-3 " + TILE[a]}>
                    <MIcon name={s.icon} className="size-6" />
                  </div>
                  <h3 className="mt-5 font-display text-base sm:text-lg md:text-xl leading-tight font-medium">{s.title}</h3>
                  <p className="mt-2 text-sm text-ink-muted leading-relaxed">{s.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="how" className="relative w-full px-4 md:px-8 lg:px-12 py-12 md:py-16 border-t border-line bg-bg-soft">
        <div className="max-w-[1300px] mx-auto">
          <div className="text-center mb-12 md:mb-16 reveal">
            <Eyebrow center>Как это работает</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-5xl tracking-tight font-medium">
              Четыре шага до пассивного дохода
            </h2>
          </div>
          <div className="relative">
            <div aria-hidden className="hidden lg:block absolute left-[12%] right-[12%] top-7 h-0.5 bg-gradient-to-r from-lime-deep/40 via-azure/40 to-orange/40" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-5">
              {STEPS.map((s, i) => {
                const a = ACCENTS[i % 4];
                return (
                  <div key={s.n} className="reveal relative text-center" style={{ animationDelay: i * 90 + "ms" }}>
                    <span className={"relative z-10 mx-auto flex size-14 items-center justify-center rounded-full text-paper shadow-lg bg-gradient-to-br " + STEPLINE[a]}>
                      <MIcon name={s.icon} className="size-7" />
                    </span>
                    <div className="mt-4 font-mono text-xs text-lime-deep">{s.n}</div>
                    <h3 className="mt-1 font-display text-lg font-medium leading-tight">{s.title}</h3>
                    <p className="mt-2 text-sm text-ink-muted leading-relaxed max-w-[230px] mx-auto">{s.text}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-12 reveal mx-auto max-w-xl rounded-2xl border border-line bg-paper p-4 shadow-sm">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-ink-hush">ваша реферальная ссылка</div>
            <div className="flex items-center gap-2 rounded-xl bg-bg-soft p-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-lime-soft text-lime-deep">
                <MIcon name="link" className="size-4" />
              </span>
              <code className="flex-1 truncate font-mono text-xs sm:text-sm text-ink">veloseller.ru/?ref=ВАШ-КОД</code>
              <span className="shrink-0 rounded-lg bg-ink text-paper px-3 py-1.5 text-xs font-semibold">Копировать</span>
            </div>
          </div>
        </div>
      </section>

      <section id="calc" className="relative w-full px-4 md:px-8 lg:px-12 py-12 md:py-16 border-t border-line">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8 md:mb-10 reveal">
            <Eyebrow center>Калькулятор дохода</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-5xl tracking-tight font-medium">
              Подвигайте ползунки
            </h2>
            <p className="mt-4 text-ink-muted max-w-2xl mx-auto text-sm md:text-base">
              Доход recurring — приходит каждый месяц, пока клиенты платят, и растёт при их апгрейде.
            </p>
          </div>
          <div className="reveal">
            <PartnerCalculator />
          </div>
        </div>
      </section>

      <section className="relative w-full px-4 md:px-8 lg:px-12 py-12 md:py-16 border-t border-line bg-bg-soft">
        <div className="max-w-[1300px] mx-auto">
          <div className="text-center mb-10 md:mb-14 reveal">
            <Eyebrow center>Условия</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-5xl tracking-tight font-medium">
              Прозрачно и без мелкого шрифта
            </h2>
          </div>
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-start">
            <ul className="space-y-3">
              {TERMS.map((item, i) => (
                <li key={item} className="reveal flex items-start gap-3 rounded-xl border border-line bg-paper p-4 transition hover:border-lime-deep/40" style={{ animationDelay: i * 60 + "ms" }}>
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-lime-soft text-lime-deep">
                    <MIcon name="check" className="size-4" />
                  </span>
                  <span className="text-sm md:text-[15px] text-ink-soft leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
            <div className="reveal rounded-2xl border border-line bg-gradient-to-br from-paper to-lime-soft p-6 lg:sticky lg:top-24">
              <div className="font-mono text-[10px] uppercase tracking-wider text-ink-hush">пример выплаты за месяц</div>
              <div className="mt-1 font-display text-4xl md:text-5xl font-medium tabular bg-gradient-to-r from-lime-deep to-azure bg-clip-text text-transparent">48 000 ₽</div>
              <div className="mt-6 rounded-xl bg-ink text-paper p-4">
                <div className="flex items-start justify-between">
                  <span className="font-mono text-[9px] uppercase tracking-wider opacity-60">партнёрская выплата</span>
                  <span className="size-6 rounded-md bg-paper/15" />
                </div>
                <div className="mt-6 font-mono text-base tracking-[0.2em]">•••• •••• •••• 4242</div>
                <div className="mt-2 flex justify-between font-mono text-[10px] opacity-70">
                  <span>ИП · самозанятый · физлицо</span>
                  <span>раз в месяц</span>
                </div>
              </div>
              <p className="mt-4 text-xs text-ink-muted leading-relaxed">Деньги приходят регулярно, пока ваши клиенты пользуются Veloseller.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative w-full px-4 md:px-8 lg:px-12 py-12 md:py-16 border-t border-line">
        <div className="max-w-[1600px] mx-auto">
          <div className="text-center mb-10 md:mb-14 reveal">
            <Eyebrow center>Почему это выгодно</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-5xl tracking-tight font-medium">
              Партнёрка, которая работает на вас
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {WHY.map((w, i) => {
              const a = ACCENTS[i % 4];
              return (
                <div key={w.title} className={"group reveal rounded-2xl border border-line bg-gradient-to-br p-5 sm:p-6 md:p-7 transition hover:-translate-y-1 hover:shadow-xl " + TINT[a] + " " + HOVER[a]} style={{ animationDelay: i * 80 + "ms" }}>
                  <div className={"flex size-12 items-center justify-center rounded-2xl text-paper shadow-md transition group-hover:scale-110 group-hover:-rotate-3 " + TILE[a]}>
                    <MIcon name={w.icon} className="size-6" />
                  </div>
                  <h3 className="mt-5 font-display text-base sm:text-lg md:text-xl leading-tight font-medium">{w.title}</h3>
                  <p className="mt-2 text-sm text-ink-muted leading-relaxed">{w.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative w-full px-4 md:px-8 lg:px-12 py-12 md:py-16 border-t border-line bg-bg-soft">
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

      <section id="apply" className="relative w-full px-4 md:px-8 lg:px-12 py-16 md:py-24 border-t border-line">
        <div className="max-w-3xl mx-auto text-center reveal">
          <h2 className="font-display text-3xl md:text-5xl tracking-tight font-medium leading-tight">
            Готовы зарабатывать{" "}
            <span className="bg-gradient-to-r from-lime-deep to-azure bg-clip-text text-transparent">с нами</span>?
          </h2>
          <p className="mt-4 text-ink-muted text-base md:text-lg leading-relaxed">
            Оставьте заявку — расскажем про условия, выдадим кабинет и реф-ссылку. Отвечаем в течение рабочего дня.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href={MAILTO} className="rounded-lg bg-ink text-paper px-6 py-3.5 text-sm font-semibold hover:bg-ink-soft transition shadow-[0_10px_30px_-10px_rgba(10,10,8,0.45)] hover:-translate-y-0.5">
              Оставить заявку
            </a>
            {PARTNER_TG ? (
              <a href={"https://t.me/" + PARTNER_TG} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-paper text-ink border border-line px-6 py-3.5 text-sm font-semibold hover:border-lime-deep/40 transition hover:-translate-y-0.5">
                Написать в Telegram
              </a>
            ) : null}
          </div>
          <p className="mt-4 font-mono text-xs text-ink-hush">{PARTNER_EMAIL}</p>
        </div>
      </section>

      <LandingFooter isAuthed={isAuthed} />
      <ScrollToTopButton />
    </main>
  );
}
