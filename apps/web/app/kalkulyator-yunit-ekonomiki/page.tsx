import Link from 'next/link';
import type { Metadata } from 'next';
import { Icons } from '@/app/_components/Icons';
import { SITE_URL } from '@/lib/features';
import LandingHeader from '@/app/_landing/Header';
import { Eyebrow } from '@/app/_landing/ui';
import UnitEconomicsCalculator from '@/app/_components/UnitEconomicsCalculator';

const PATH = '/kalkulyator-yunit-ekonomiki';
const TITLE = 'Калькулятор юнит-экономики SKU для Wildberries и Ozon';
const DESCRIPTION =
  'Бесплатный калькулятор юнит-экономики товара на маркетплейсе: цена, себестоимость, комиссия и логистика → прибыль с единицы, маржинальность и наценка. Проверьте, прибыльный ли SKU на Wildberries и Ozon.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'калькулятор юнит-экономики',
    'расчёт маржи на маркетплейсе',
    'прибыль с единицы',
    'юнит-экономика wildberries',
    'юнит-экономика ozon',
    'калькулятор маржинальности',
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
  { slug: 'unit-ekonomika-sku-wildberries-ozon', title: 'Юнит-экономика SKU: как считать прибыль на маркетплейсе' },
  { slug: 'marzhinalnost-i-nacenka-marketplace', title: 'Маржинальность и наценка: в чём разница' },
  { slug: 'drr-roas-reklamnye-metriki-marketplace', title: 'ДРР и ROAS: словарь рекламных метрик' },
  { slug: 'procent-vykupa-wildberries', title: 'Процент выкупа: как влияет на экономику' },
];

const FAQ = [
  {
    q: 'Как считается прибыль с единицы товара?',
    a: 'Прибыль с единицы = цена продажи − себестоимость − комиссия маркетплейса (в рублях) − логистика, хранение и прочие удержания. Калькулятор считает это автоматически и показывает маржинальность и наценку.',
  },
  {
    q: 'Что включить в расходы кроме комиссии?',
    a: 'Логистику и последнюю милю, хранение (на FBO начисляется ежедневно), эквайринг и обработку, рекламу (ДРР), потери на возвратах (зависят от процента выкупа). Чем полнее учтёте, тем ближе к реальной марже.',
  },
  {
    q: 'Какая маржинальность считается нормальной?',
    a: 'Запас по марже должен покрывать рекламу и риски: предельный ДРР должен быть ниже маржинальности. Если чистая маржа близка к нулю или отрицательна, товар не выдержит продвижения и возвратов.',
  },
];

export default function UnitEconomicsCalculatorPage() {
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
            Калькулятор юнит-экономики SKU
          </h1>
          <p className="mt-5 md:mt-6 text-ink-muted text-base md:text-lg leading-relaxed">
            Оборот растёт, а прибыли нет? Часто причина — отрицательная юнит-экономика, которую не видно за валом продаж.
            Подвигайте ползунки и проверьте, сколько реально зарабатываете с единицы на Wildberries и Ozon.
          </p>

          <div className="mt-8 md:mt-10">
            <UnitEconomicsCalculator />
          </div>

          <h2 className="font-display text-2xl md:text-3xl mt-14 mb-4 tracking-tight font-medium">Как это считается</h2>
          <div className="my-6 font-mono text-sm md:text-[15px] bg-bg-soft border border-line rounded-lg px-5 py-4 text-ink-soft tabular space-y-1">
            <div>Прибыль с единицы = Цена − Себестоимость − Комиссия (₽) − Логистика и пр.</div>
            <div>Маржинальность = Прибыль ÷ Цена × 100%</div>
          </div>
          <p className="my-4 text-ink-soft leading-relaxed text-[15px] md:text-base">
            Маржинальность считается от цены, наценка — от себестоимости, и это всегда разные числа. Принимать решения
            нужно по чистой марже после всех удержаний — подробнее в статье про{' '}
            <Link href="/news/marzhinalnost-i-nacenka-marketplace" className="text-lime-deep underline decoration-lime-deep/30 underline-offset-2">маржинальность и наценку</Link>.
          </p>

          <h2 className="font-display text-2xl md:text-3xl mt-12 mb-4 tracking-tight font-medium">Что обязательно учесть</h2>
          <ul className="my-5 space-y-2 pl-6 list-disc marker:text-lime-deep text-ink-soft leading-relaxed text-[15px] md:text-base">
            <li>Комиссию категории — она зависит от товара и схемы.</li>
            <li>Логистику и последнюю милю, а на FBO — ещё и ежедневное хранение.</li>
            <li>Рекламу: предельный{' '}
              <Link href="/news/drr-roas-reklamnye-metriki-marketplace" className="text-lime-deep underline decoration-lime-deep/30 underline-offset-2">ДРР</Link>{' '}должен быть ниже маржинальности.
            </li>
            <li>Возвраты — они зависят от{' '}
              <Link href="/news/procent-vykupa-wildberries" className="text-lime-deep underline decoration-lime-deep/30 underline-offset-2">процента выкупа</Link>.
            </li>
          </ul>
          <p className="my-4 text-ink-soft leading-relaxed text-[15px] md:text-base">
            Полный разбор — в статье про{' '}
            <Link href="/news/unit-ekonomika-sku-wildberries-ozon" className="text-lime-deep underline decoration-lime-deep/30 underline-offset-2">юнит-экономику SKU</Link>.
            А оценить потери от простоев и момент дозаказа помогут{' '}
            <Link href="/kalkulyator-poteryannoy-vyruchki" className="text-lime-deep underline decoration-lime-deep/30 underline-offset-2">калькулятор потерянной выручки</Link>{' '}и{' '}
            <Link href="/kalkulyator-tochki-dozakaza" className="text-lime-deep underline decoration-lime-deep/30 underline-offset-2">калькулятор точки дозаказа</Link>.
          </p>

          <div className="mt-14 md:mt-16 relative overflow-hidden rounded-2xl border-2 border-lime-deep/30 bg-gradient-to-br from-lime-soft via-paper to-paper p-6 md:p-10">
            <div className="absolute -right-10 -top-10 size-40 rounded-full bg-lime/30 blur-2xl" />
            <div className="relative">
              <h3 className="font-display text-xl md:text-2xl tracking-tight font-medium leading-tight">
                Veloseller считает юнит-экономику по каждому SKU автоматически
              </h3>
              <p className="mt-3 text-ink-muted text-sm md:text-base leading-relaxed max-w-xl">
                Подключите Wildberries или Ozon по API — комиссия, логистика и цена подтянутся сами,
                и вы увидите реальную маржу каждого товара рядом со скоростью продаж и остатками.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/register" className="inline-flex items-center gap-2 rounded-lg bg-ink text-paper px-5 py-3 text-sm font-semibold hover:bg-ink-soft transition shadow-[0_10px_30px_-10px_rgba(10,10,8,0.4)]">
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
                    <h4 className="font-display text-base md:text-lg font-medium group-hover:text-lime-deep transition leading-tight">{r.title}</h4>
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
