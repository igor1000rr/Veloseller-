import Link from 'next/link';
import type { Metadata } from 'next';
import { Icons } from '@/app/_components/Icons';
import { SITE_URL } from '@/lib/features';
import LandingHeader from '@/app/_landing/Header';
import { Eyebrow } from '@/app/_landing/ui';
import ReorderPointCalculator from '@/app/_components/ReorderPointCalculator';

const PATH = '/kalkulyator-tochki-dozakaza';
const TITLE = 'Калькулятор точки дозаказа и страхового запаса';
const DESCRIPTION =
  'Бесплатный калькулятор точки дозаказа (reorder point) и страхового запаса (safety stock) для Wildberries и Ozon. Введите продажи в день, срок поставки и буфер — узнайте, при каком остатке заказывать поставку.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'калькулятор точки дозаказа',
    'reorder point калькулятор',
    'калькулятор safety stock',
    'страховой запас расчёт',
    'когда заказывать поставку',
    'точка дозаказа wildberries',
  ],
  alternates: { canonical: PATH },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}${PATH}`,
    type: 'website',
    locale: 'ru_RU',
    siteName: 'Veloseller',
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

const RELATED = [
  {
    slug: 'tochka-dozakaza-reorder-point-wildberries-ozon',
    title: 'Точка дозаказа: когда заказывать поставку',
  },
  {
    slug: 'minimalnyy-ostatok-safety-stock-wildberries-ozon',
    title: 'Минимальный остаток (safety stock): сколько держать',
  },
  {
    slug: 'dni-pokrytiya-ostatka-marketplace',
    title: 'Дни покрытия: на сколько хватит остатка',
  },
  {
    slug: 'prognoz-sprosa-marketplace-metody',
    title: 'Прогноз спроса: простые рабочие методы',
  },
];

const FAQ = [
  {
    q: 'Как рассчитать точку дозаказа?',
    a: 'Точка дозаказа = средние продажи в день × срок поставки + страховой запас. Как только остаток падает до этого уровня, нужно заказывать поставку — новая партия успеет прийти до того, как закончится текущая.',
  },
  {
    q: 'Что такое страховой запас (safety stock)?',
    a: 'Это буфер на случай всплеска спроса или задержки поставки. В калькуляторе он задан в днях: страховой запас в штуках = продажи в день × число дней буфера. Чем выше непредсказуемость спроса и срока, тем больше буфер.',
  },
  {
    q: 'Чем точка дозаказа на FBO отличается от FBS?',
    a: 'На FBO срок поставки длиннее — добавляются логистика до склада маркетплейса и приёмка по квоте, поэтому точка дозаказа выше и заказывать нужно раньше. На FBS lead time короче и буфер можно держать меньше.',
  },
];

export default function ReorderPointCalculatorPage() {
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: TITLE, item: `${SITE_URL}${PATH}` },
    ],
  };

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <main className="relative bg-paper-warm text-ink min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-noise opacity-100 mix-blend-multiply" />

      <LandingHeader isAuthed={false} />

      <section className="relative w-full px-4 md:px-8 lg:px-12 pt-10 md:pt-14 pb-16 md:pb-20">
        <div className="max-w-[840px] mx-auto">
          <nav className="text-xs font-mono text-ink-hush mb-8 flex items-center gap-2 flex-wrap" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-lime-deep transition">Главная</Link>
            <span className="text-ink-hush/50">/</span>
            <span className="text-ink-soft">Калькулятор</span>
          </nav>

          <Eyebrow>Бесплатный инструмент</Eyebrow>
          <h1 className="mt-3 font-display text-[28px] sm:text-4xl md:text-5xl tracking-tight font-medium leading-[1.1]">
            Калькулятор точки дозаказа и страхового запаса
          </h1>
          <p className="mt-5 md:mt-6 text-ink-muted text-base md:text-lg leading-relaxed">
            Главный вопрос пополнения — не «сколько», а «когда» заказывать. Подвигайте ползунки и узнайте,
            при каком остатке оформлять поставку, чтобы не уйти в ноль и не заморозить деньги в излишках.
          </p>

          <div className="mt-8 md:mt-10">
            <ReorderPointCalculator />
          </div>

          <h2 className="font-display text-2xl md:text-3xl mt-14 mb-4 tracking-tight font-medium">
            Как это считается
          </h2>
          <div className="my-6 font-mono text-sm md:text-[15px] bg-bg-soft border border-line rounded-lg px-5 py-4 text-ink-soft tabular space-y-1">
            <div>Страховой запас = Продажи в день × Дни буфера</div>
            <div>Точка дозаказа = Продажи в день × Срок поставки + Страховой запас</div>
          </div>
          <p className="my-4 text-ink-soft leading-relaxed text-[15px] md:text-base">
            Идея проста: к моменту, когда текущий запас закончится, новая партия уже должна приехать. Поэтому
            заказываем не «когда выглядит мало», а когда остаток дошёл до рассчитанной точки. Подробный разбор —
            в статье про{' '}
            <Link href="/news/tochka-dozakaza-reorder-point-wildberries-ozon" className="text-lime-deep underline decoration-lime-deep/30 underline-offset-2">точку дозаказа</Link>.
          </p>

          <h2 className="font-display text-2xl md:text-3xl mt-12 mb-4 tracking-tight font-medium">
            Что важно учесть
          </h2>
          <ul className="my-5 space-y-2 pl-6 list-disc marker:text-lime-deep text-ink-soft leading-relaxed text-[15px] md:text-base">
            <li>Срок поставки — это полное время: производство + доставка + приёмка маркетплейсом, а не только логистика.</li>
            <li>Продажи в день берите по дням, когда товар был в наличии, — иначе скорость занижена и точка выйдет слишком низкой.</li>
            <li>На FBO буфер обычно больше из-за лимитов приёмки и более длинного lead time.</li>
            <li>Чем выше непредсказуемость спроса, тем больше{' '}
              <Link href="/news/minimalnyy-ostatok-safety-stock-wildberries-ozon" className="text-lime-deep underline decoration-lime-deep/30 underline-offset-2">страховой запас</Link>.
            </li>
          </ul>
          <p className="my-4 text-ink-soft leading-relaxed text-[15px] md:text-base">
            Заодно прикиньте, сколько уже стоят простои, в{' '}
            <Link href="/kalkulyator-poteryannoy-vyruchki" className="text-lime-deep underline decoration-lime-deep/30 underline-offset-2">калькуляторе потерянной выручки</Link>.
          </p>

          <div className="mt-14 md:mt-16 relative overflow-hidden rounded-2xl border-2 border-lime-deep/30 bg-gradient-to-br from-lime-soft via-paper to-paper p-6 md:p-10">
            <div className="absolute -right-10 -top-10 size-40 rounded-full bg-lime/30 blur-2xl" />
            <div className="relative">
              <h3 className="font-display text-xl md:text-2xl tracking-tight font-medium leading-tight">
                Veloseller считает точку дозаказа по каждому SKU автоматически
              </h3>
              <p className="mt-3 text-ink-muted text-sm md:text-base leading-relaxed max-w-xl">
                Подключите Wildberries или Ozon по API — сервис держит точку дозаказа и страховой запас по
                каждому товару и складу с учётом реальной скорости продаж и срока поставки, и шлёт алерт, когда пора заказывать.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 rounded-lg bg-ink text-paper px-5 py-3 text-sm font-semibold hover:bg-ink-soft transition shadow-[0_10px_30px_-10px_rgba(10,10,8,0.4)]"
                >
                  Начать бесплатно <Icons.ArrowRight size={12} />
                </Link>
                <Link href="/#pricing" className="inline-flex items-center px-5 py-3 text-sm text-ink-muted hover:text-lime-deep transition">
                  Посмотреть тарифы
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-14 md:mt-16">
            <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-ink-hush mb-5">Полезные материалы</h3>
            <div className="space-y-3">
              {RELATED.map((r) => (
                <Link key={r.slug} href={`/news/${r.slug}`} className="block group">
                  <div className="rounded-xl border border-line bg-paper p-4 md:p-5 hover:border-lime-deep/40 transition">
                    <h4 className="font-display text-base md:text-lg font-medium group-hover:text-lime-deep transition leading-tight">
                      {r.title}
                    </h4>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-14 md:mt-16">
            <h2 className="font-display text-2xl md:text-3xl mb-5 tracking-tight font-medium">Частые вопросы</h2>
            <div className="space-y-3">
              {FAQ.map((f) => (
                <details key={f.q} className="group rounded-xl border border-line bg-paper p-4 transition hover:border-lime-deep/40">
                  <summary className="cursor-pointer list-none font-medium text-ink flex items-center justify-between gap-4">
                    <span>{f.q}</span>
                    <span className="text-lime-deep font-mono shrink-0 transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-sm text-ink-muted leading-relaxed">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-line bg-bg-soft">
        <div className="max-w-[1600px] mx-auto w-full px-4 md:px-8 lg:px-12 py-10 md:py-14">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2.5">
              <Icons.Logo />
              <span className="font-display text-lg font-medium tracking-tight">
                Velo<span className="text-lime-deep">seller</span>
              </span>
            </div>
            <div className="font-mono text-xs text-ink-hush">
              © {new Date().getFullYear()} Veloseller — управление складом для ecommerce
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
