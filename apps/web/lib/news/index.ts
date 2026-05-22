// Публичный API раздела новостей.

import { posts } from "./posts";
import type { NewsPost, NewsCategory } from "./types";

export * from "./types";
export { posts } from "./posts";

export function getAllPosts(): NewsPost[] {
  return [...posts].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

export function getPostBySlug(slug: string): NewsPost | undefined {
  return posts.find((p) => p.slug === slug);
}

export function getPostsByCategory(category: NewsCategory): NewsPost[] {
  return getAllPosts().filter((p) => p.category === category);
}

export function getRelatedPosts(slug: string, limit = 3): NewsPost[] {
  const post = getPostBySlug(slug);
  if (!post) return [];

  // Сначала — явные related slugs из метаданных поста
  const explicit = (post.related || [])
    .map((s) => getPostBySlug(s))
    .filter((p): p is NewsPost => !!p);

  if (explicit.length >= limit) return explicit.slice(0, limit);

  // Добиваем по совпадению категории и тегов
  const others = getAllPosts().filter(
    (p) => p.slug !== slug && !explicit.find((e) => e.slug === p.slug),
  );
  const scored = others
    .map((p) => ({
      post: p,
      score:
        (p.category === post.category ? 2 : 0) +
        p.tags.filter((t) => post.tags.includes(t)).length,
    }))
    .sort((a, b) => b.score - a.score);

  return [...explicit, ...scored.slice(0, limit - explicit.length).map((s) => s.post)];
}
