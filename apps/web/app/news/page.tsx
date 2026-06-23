import Link from 'next/link';
import type { Metadata } from 'next';
import { Icons } from '@/app/_components/Icons';
import { posts } from '@/lib/news/posts';
import { CATEGORY_LABELS, CATEGORY_COLORS } from '@/lib/news/types';
import { SITE_URL } from '@/lib/features';
import LandingHeader from '@/app/_landing/Header';

// Title уйдёт через title.template из layout: "Новости и гайды — Veloseller"
export const metadata: Metadata = {
  title: 'Новости и гайды',
  description:
    'Гайды по управлению остатками на Wildberries и Ozon: оборачиваемость, out-of-stock, лимиты приёмки FBO, индекс популярности WB, safety stock, юнит-экономика, комиссии 2026, ABC/XYZ анализ.',
  alternates: { canonical: '/news' },
  openGraph: {
    title: 'Новости и гайды — Veloseller',
    description: 'Гайды по управлению остатками на Wildberries и Ozon для селлеров маркетплейсов.',
    url: `${SITE_URL}/news`,
    type: 'website',
  },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function NewsListPage() {
  const sorted = [...posts].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  // JSON-LD CollectionPage для индекса гайдов — даёт Google понять,
  // что эта страница есть лента публикаций, а не одиночная статья
  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Новости и гайды Veloseller',
    description:
      'Гайды по управлению остатками на Wildberries и Ozon для маркетплейс-селлеров.',
    url: `${SITE_URL}/news`,
    inLanguage: 'ru-RU',
    isPartOf: {
      '@type': 'WebSite',
      name: 'Veloseller',
      url: SITE_URL,
    },
    hasPart: sorted.map((post) => ({
      '@type': 'Article',
      headline: post.title,
      description: post.description,
      url: `${SITE_URL}/news/${post.slug}`,
      datePublished: post.publishedAt,
      inLanguage: 'ru-RU',
    })),
  };

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Новости', item: `${SITE_URL}/news` },
    ],
  };

  return (
    <main className="relative bg-paper-warm text-ink min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-noise opacity-100 mix-blend-multiply" />
      <div
        aria-hidden
        className="pointer-events-none fixed -top-40 -left-40 size-[500px] rounded-full blur-3xl opacity-40"
        style={{ background: 'radial-gradient(closest-side, rgba(132,204,22,0.20), transparent 70%)' }}
      />

      <LandingHeader isAuthed={false} />

      <section className="relative w-full px-4 md:px-8 lg:px-12 pt-12 md:pt-20 pb-10 md:pb-14">
        <div className="max-w-[1100px] mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-lime-deep/30 bg-lime-soft">
            <span className="size-1.5 rounded-full bg-lime-deep" />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime-deep font-semibold">
              Гайды и аналитика
            </span>
          </div>
          <h1 className="mt-6 font-display text-[40px] sm:text-5xl md:text-6xl tracking-tight font-medium leading-[1.05]">
            Гайды по управлению<br className="hidden md:block" />{' '}
            <span className="text-lime-deep italic">остатками на маркетплейсах</span>
          </h1>
          <p className="mt-5 text-ink-muted text-base md:text-lg max-w-2xl leading-relaxed">
            Wildberries, Ozon, формулы оборачиваемости, out-of-stock и safety stock.
            Разборы для селлеров, без воды и общих фраз.
          </p>
        </div>
      </section>

      <section className="relative w-full px-4 md:px-8 lg:px-12 pb-20 md:pb-28">
        <div className="max-w-[1100px] mx-auto space-y-5 md:space-y-6">
          {sorted.map((post) => (
            <Link key={post.slug} href={`/news/${post.slug}`} className="group block">
              <article className="rounded-2xl border border-line bg-paper p-6 md:p-8 hover:border-lime-deep/40 hover:shadow-lg transition">
                <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                  <span className={`px-2.5 py-1 rounded border ${CATEGORY_COLORS[post.category]} font-semibold uppercase tracking-wider`}>
                    {CATEGORY_LABELS[post.category]}
                  </span>
                  <time dateTime={post.publishedAt} className="text-ink-hush">
                    {formatDate(post.publishedAt)}
                  </time>
                  <span className="text-ink-hush">·</span>
                  <span className="text-ink-hush">{post.readingMinutes} мин чтения</span>
                </div>
                <h2 className="mt-4 font-display text-xl md:text-3xl tracking-tight font-medium leading-tight group-hover:text-lime-deep transition">
                  {post.title}
                </h2>
                <p className="mt-3 text-ink-muted text-sm md:text-base leading-relaxed">
                  {post.description}
                </p>
                <div className="mt-5 inline-flex items-center gap-1.5 text-sm text-lime-deep font-medium">
                  Читать <Icons.ArrowRight size={12} />
                </div>
              </article>
            </Link>
          ))}
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
