import Link from 'next/link';
import type { Metadata } from 'next';
import { Icons } from '@/app/_components/Icons';
import { SITE_URL } from '@/lib/features';
import LandingHeader from '@/app/_landing/Header';
import { Eyebrow } from '@/app/_landing/ui';
import LostRevenueCalculator from '@/app/_components/LostRevenueCalculator';

const PATH = '/kalkulyator-poteryannoy-vyruchki';
const TITLE = 'Калькулятор потерянной выручки из-за out-of-stock';
const DESCRIPTION =
  'Бесплатный калькулятор: посчитайте, сколько выручки вы теряете из-за нулевых остатков на Wildberries и Ozon. Введите продажи в день, цену и дни без остатка — увидите потери за месяц и год.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'калькулятор потерянной выручки',
    'потери на out-of-stock',
    'цена стокаута',
    'недополученная выручка маркетплейс',
    'out of stock калькулятор',
    'потерянная выручка wildberries',
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
    slug: 'out-of-stock-poteryannaya-vyruchka-ozon-wildberries',
    title: 'Out-of-stock и потерянная выручка: как считать и не терять',
  },
  {
    slug: 'minimalnyy-ostatok-safety-stock-wildberries-ozon',
    title: 'Минимальный остаток (safety stock): сколько держать',
  },
  {
    slug: 'tochka-dozakaza-reorder-point-wildberries-ozon',
    title: 'Точка дозаказа: когда заказывать поставку',
  },
  {
    slug: 'dni-pokrytiya-ostatka-marketplace',
    title: 'Дни покрытия: на сколько хватит остатка',
  },
];

const FAQ = [
  {
    q: 'Как считается потерянная выручка из-за out-of-stock?',
    a: 'Потерянные продажи = средние продажи в день (когда товар в наличии) × число дней без остатка. Потерянная выручка = потерянные продажи × цена за единицу. Калькулятор делает это автоматически и пересчитывает на месяц и год.',
  },
  {
    q: 'Почему этих потерь не видно в кабинете Wildberries или Ozon?',
    a: 'В кабинете отражаются только состоявшиеся продажи. Когда товара нет в наличии, продажи не происходят — и строки об упущенном спросе нигде не появляется. Поэтому потери из-за нулевых остатков незаметны без отдельного расчёта.',
  },
  {
    q: 'Как уменьшить потери из-за нулевых остатков?',
    a: 'Держать страховой запас (safety stock), заказывать поставку по точке дозаказа и получать алерты до того, как товар уйдёт в ноль. Тогда продажи не прерываются, а позиции карточки не проседают.',
  },
];

export default function LostRevenueCalculatorPage() {
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
            Калькулятор потерянной выручки из-за out-of-stock
          </h1>
          <p className="mt-5 md:mt-6 text-ink-muted text-base md:text-lg leading-relaxed">
            Каждый день, что товар в нуле, — это не пауза, а прямой минус к выручке и позициям карточки.
            Подвигайте ползунки и увидите, сколько вы теряете на нулевых остатках на Wildberries и Ozon.
          </p>

          <div className="mt-8 md:mt-10">
            <LostRevenueCalculator />
          </div>

          <h2 className="font-display text-2xl md:text-3xl mt-14 mb-4 tracking-tight font-medium">
            Как это считается
          </h2>
          <p className="my-4 text-ink-soft leading-relaxed text-[15px] md:text-base">
            Логика простая и прозрачная — никакой магии:
          </p>
          <div className="my-6 font-mono text-sm md:text-[15px] bg-bg-soft border border-line rounded-lg px-5 py-4 text-ink-soft tabular space-y-1">
            <div>Потерянные продажи = Продажи в день × Дни без остатка</div>
            <div>Потерянная выручка = Потерянные продажи × Цена</div>
          </div>
          <p className="my-4 text-ink-soft leading-relaxed text-[15px] md:text-base">
            Важная тонкость: продажи в день нужно брать по дням, когда товар был{' '}
            <Link href="/news/out-of-stock-poteryannaya-vyruchka-ozon-wildberries" className="text-lime-deep underline decoration-lime-deep/30 underline-offset-2">в наличии</Link>,
            а не по календарю. Если делить на все дни месяца, дни простоя занижают скорость — и потери кажутся
            меньше, чем есть. Это основа методики реальной скорости продаж.
          </p>

          <h2 className="font-display text-2xl md:text-3xl mt-12 mb-4 tracking-tight font-medium">
            Почему out-of-stock дороже, чем кажется
          </h2>
          <ul className="my-5 space-y-2 pl-6 list-disc marker:text-lime-deep text-ink-soft leading-relaxed text-[15px] md:text-base">
            <li>Прямые потери выручки — спрос был, а продажи не случилось.</li>
            <li>Просадка позиций: карточка с нулём теряет в ранжировании, и после возврата товара продажи восстанавливаются не сразу.</li>
            <li>Потерянные клиенты уходят к конкуренту и часто не возвращаются.</li>
            <li>Слитая реклама: оплаченные клики ведут на товар, которого нет в наличии.</li>
          </ul>
          <p className="my-4 text-ink-soft leading-relaxed text-[15px] md:text-base">
            Защита системная: держать{' '}
            <Link href="/news/minimalnyy-ostatok-safety-stock-wildberries-ozon" className="text-lime-deep underline decoration-lime-deep/30 underline-offset-2">страховой запас</Link>,
            заказывать поставку по{' '}
            <Link href="/news/tochka-dozakaza-reorder-point-wildberries-ozon" className="text-lime-deep underline decoration-lime-deep/30 underline-offset-2">точке дозаказа</Link>{' '}
            и следить за{' '}
            <Link href="/news/dni-pokrytiya-ostatka-marketplace" className="text-lime-deep underline decoration-lime-deep/30 underline-offset-2">днями покрытия</Link>,
            чтобы вовремя пополнять остаток.
          </p>

          <div className="mt-14 md:mt-16 relative overflow-hidden rounded-2xl border-2 border-lime-deep/30 bg-gradient-to-br from-lime-soft via-paper to-paper p-6 md:p-10">
            <div className="absolute -right-10 -top-10 size-40 rounded-full bg-lime/30 blur-2xl" />
            <div className="relative">
              <h3 className="font-display text-xl md:text-2xl tracking-tight font-medium leading-tight">
                Не считайте потери вручную — пусть это делает Veloseller
              </h3>
              <p className="mt-3 text-ink-muted text-sm md:text-base leading-relaxed max-w-xl">
                Подключите Wildberries или Ozon по API — сервис сам считает потерянную выручку по каждому SKU,
                реальную скорость продаж с учётом дней без остатка и предупреждает о риске нуля заранее.
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
