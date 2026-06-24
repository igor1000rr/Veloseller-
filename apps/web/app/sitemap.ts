import type { MetadataRoute } from 'next';
import { posts } from '@/lib/news/posts';
import { SITE_URL, APP_PROMO_ENABLED } from '@/lib/features';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // Только публичные, индексируемые страницы. Auth-страницы (login/register/
  // forgot-password) — noindex, поэтому в sitemap их НЕ кладём (иначе в GSC
  // «Submitted URL marked noindex» + трата краул-бюджета). Хост — из SITE_URL
  // (на .com будет свой домен, а не хардкод veloseller.ru).
  const entries: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${SITE_URL}/news`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/kalkulyator-poteryannoy-vyruchki`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/partner`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    // Гайды — каждый отдельной записью
    ...posts.map((post) => ({
      url: `${SITE_URL}/news/${post.slug}`,
      lastModified: new Date(post.publishedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ];

  // /apps — публичная промо-страница, но только когда включён флаг (иначе она 404).
  if (APP_PROMO_ENABLED) {
    entries.push({ url: `${SITE_URL}/apps`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 });
  }

  return entries;
}
