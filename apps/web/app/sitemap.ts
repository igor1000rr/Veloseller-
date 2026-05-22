// Sitemap для Google. Включает все публичные URL и посты новостей.
// Next.js в build время генерирует /sitemap.xml из этого файла.

import type { MetadataRoute } from "next";
import { getAllPosts, SITE_URL } from "@/lib/news";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const posts = getAllPosts();

  const postUrls: MetadataRoute.Sitemap = posts.map((p) => ({
    url: `${SITE_URL}/news/${p.slug}`,
    lastModified: new Date(p.updatedAt ?? p.publishedAt),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/news`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/register`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    ...postUrls,
  ];
}
