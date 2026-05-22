import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Icons } from '@/app/_components/Icons';
import { posts } from '@/lib/news/posts';
import { CATEGORY_LABELS, CATEGORY_COLORS } from '@/lib/news/types';
import { renderMarkdown } from '@/lib/news/render';

const SITE_URL = 'https://veloseller.ru';

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = posts.find((p) => p.slug === slug);
  if (!post) return { title: 'Не найдено — Veloseller' };

  return {
    title: `${post.title} — Veloseller`,
    description: post.description,
    keywords: post.keywords,
    alternates: { canonical: `${SITE_URL}/news/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      url: `${SITE_URL}/news/${post.slug}`,
      type: 'article',
      publishedTime: post.publishedAt,
      locale: 'ru_RU',
      siteName: 'Veloseller',
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
    },
  };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default async function NewsPostPage({ params }: Props) {
  const { slug } = await params;
  const post = posts.find((p) => p.slug === slug);
  if (!post) notFound();

  const related = posts
    .filter((p) => p.slug !== post.slug)
    .sort((a, b) => {
      // та же категория идёт первой
      const aMatch = a.category === post.category ? 0 : 1;
      const bMatch = b.category === post.category ? 0 : 1;
      return aMatch - bMatch;
    })
    .slice(0, 3);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.publishedAt,
    keywords: post.keywords.join(', '),
    author: { '@type': 'Organization', name: 'Veloseller', url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: 'Veloseller',
      url: SITE_URL,
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${SITE_URL}/news/${post.slug}`,
    },
    inLanguage: 'ru-RU',
  };

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Новости', item: `${SITE_URL}/news` },
      { '@type': 'ListItem', position: 3, name: post.title, item: `${SITE_URL}/news/${post.slug}` },
    ],
  };

  return (
    <main className="relative bg-paper-warm text-ink min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-noise opacity-100 mix-blend-multiply" />

      <header className="sticky top-0 z-30 backdrop-blur-md bg-bg/85 border-b border-line">
        <div className="w-full px-4 md:px-8 lg:px-12 py-3 md:py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <Icons.Logo />
            <span className="font-display text-lg font-medium tracking-tight">
              Velo<span className="text-lime-deep">seller</span>
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-7">
            <Link href="/" className="text-sm text-ink-soft hover:text-lime-deep transition">Главная</Link>
            <Link href={'/news' as any} className="text-sm text-ink-soft hover:text-lime-deep transition">Новости</Link>
            <Link href="/#pricing" className="text-sm text-ink-soft hover:text-lime-deep transition">Тарифы</Link>
            <Link href="/#faq" className="text-sm text-ink-soft hover:text-lime-deep transition">FAQ</Link>
          </nav>
          <div className="flex items-center gap-2 md:gap-3">
            <Link href={'/login' as any} className="hidden md:inline-block text-sm text-ink-soft hover:text-ink transition px-2 py-1">Войти</Link>
            <Link href={'/register' as any} className="inline-flex rounded-lg bg-ink text-paper px-4 py-2 text-sm font-semibold hover:bg-ink-soft transition">Начать</Link>
          </div>
        </div>
      </header>

      <article className="relative w-full px-4 md:px-8 lg:px-12 pt-10 md:pt-14 pb-16 md:pb-20">
        <div className="max-w-[760px] mx-auto">
          <nav className="text-xs font-mono text-ink-hush mb-8 flex items-center gap-2 flex-wrap" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-lime-deep transition">Главная</Link>
            <span className="text-ink-hush/50">/</span>
            <Link href={'/news' as any} className="hover:text-lime-deep transition">Новости</Link>
            <span className="text-ink-hush/50">/</span>
            <span className="text-ink-soft">{CATEGORY_LABELS[post.category]}</span>
          </nav>

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

          <h1 className="mt-5 font-display text-[28px] sm:text-4xl md:text-5xl tracking-tight font-medium leading-[1.1]">
            {post.title}
          </h1>

          <p className="mt-5 md:mt-6 text-ink-muted text-base md:text-lg leading-relaxed">
            {post.description}
          </p>

          <hr className="my-10 border-line" />

          <div>{renderMarkdown(post.content)}</div>

          <div className="mt-14 md:mt-16 relative overflow-hidden rounded-2xl border-2 border-lime-deep/30 bg-gradient-to-br from-lime-soft via-paper to-paper p-6 md:p-10">
            <div className="absolute -right-10 -top-10 size-40 rounded-full bg-lime/30 blur-2xl" />
            <div className="relative">
              <h3 className="font-display text-xl md:text-2xl tracking-tight font-medium leading-tight">
                Считаем оборачиваемость, out-of-stock и safety stock автоматически
              </h3>
              <p className="mt-3 text-ink-muted text-sm md:text-base leading-relaxed max-w-xl">
                Подключите склад Ozon FBO/FBS или Wildberries — получите TVelo по каждому SKU,
                прогнозы out-of-stock, расчёт минимального остатка и алерты в Telegram.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href={'/register' as any}
                  className="inline-flex items-center gap-2 rounded-lg bg-ink text-paper px-5 py-3 text-sm font-semibold hover:bg-ink-soft transition shadow-[0_10px_30px_-10px_rgba(10,10,8,0.4)]"
                >
                  Начать бесплатно <Icons.ArrowRight size={12} />
                </Link>
                <Link
                  href="/#pricing"
                  className="inline-flex items-center px-5 py-3 text-sm text-ink-muted hover:text-lime-deep transition"
                >
                  Посмотреть тарифы
                </Link>
              </div>
            </div>
          </div>

          {related.length > 0 && (
            <div className="mt-14 md:mt-16">
              <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-ink-hush mb-5">
                Похожие материалы
              </h3>
              <div className="space-y-3">
                {related.map((r) => (
                  <Link key={r.slug} href={`/news/${r.slug}` as any} className="block group">
                    <div className="rounded-xl border border-line bg-paper p-4 md:p-5 hover:border-lime-deep/40 transition">
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono mb-2">
                        <span className={`px-2 py-0.5 rounded border ${CATEGORY_COLORS[r.category]} font-semibold uppercase tracking-wider`}>
                          {CATEGORY_LABELS[r.category]}
                        </span>
                        <span className="text-ink-hush">{r.readingMinutes} мин</span>
                      </div>
                      <h4 className="font-display text-base md:text-lg font-medium group-hover:text-lime-deep transition leading-tight">
                        {r.title}
                      </h4>
                      <p className="mt-1.5 text-sm text-ink-muted line-clamp-2">{r.description}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="mt-12 md:mt-14 pt-8 border-t border-line">
            <Link href={'/news' as any} className="inline-flex items-center gap-2 text-sm text-ink-muted hover:text-lime-deep transition">
              <span className="font-mono">←</span> Все материалы
            </Link>
          </div>
        </div>
      </article>

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
