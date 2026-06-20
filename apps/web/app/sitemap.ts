import type { MetadataRoute } from 'next';
import { posts } from '@/lib/news/posts';

const SITE_URL = 'https://veloseller.ru';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    // Главная и публичные страницы
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/news`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    // Auth-страницы — публичные, но низкий приоритет
    {
      url: `${SITE_URL}/login`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/register`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${SITE_URL}/forgot-password`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    // Правовые страницы
    {
      url: `${SITE_URL}/privacy`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    // Партнёрская программа — публичная маркетинговая страница
    {
      url: `${SITE_URL}/partner`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    // Гайды — каждый отдельной записью
    ...posts.map((post) => ({
      url: `${SITE_URL}/news/${post.slug}`,
      lastModified: new Date(post.publishedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ];
}
