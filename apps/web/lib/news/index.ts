// Публичный API системы новостей — доступ к постам и справочники.

import type { NewsCategory, NewsPost } from "./types";
import { posts } from "./posts";

export * from "./types";

/** Все посты, отсортированные по дате публикации, новые выше. */
export function getAllPosts(): NewsPost[] {
  return [...posts].sort((a, b) =>
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

/** Пост по slug или undefined если не найден */
export function getPostBySlug(slug: string): NewsPost | undefined {
  return posts.find((p) => p.slug === slug);
}

/** Посты в той же категории */
export function getPostsByCategory(category: NewsCategory): NewsPost[] {
  return getAllPosts().filter((p) => p.category === category);
}

/**
 * Связанные посты: сначала тот же category, потом по пересечению tags. Максимум n.
 */
export function getRelatedPosts(post: NewsPost, n = 3): NewsPost[] {
  const others = getAllPosts().filter((p) => p.slug !== post.slug);

  const scored = others.map((p) => {
    let score = 0;
    if (p.category === post.category) score += 10;
    const sharedTags = p.tags.filter((t) => post.tags.includes(t)).length;
    score += sharedTags * 3;
    return { post: p, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((s) => s.post);
}

export const SITE_URL = "https://veloseller.ru";
