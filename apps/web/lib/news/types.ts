// Типы и константы для раздела /news.

export type NewsCategory = "analytics" | "inventory" | "marketplace" | "finance";

export type FaqItem = {
  q: string;
  a: string;
};

export type NewsPost = {
  slug: string;
  title: string;
  description: string; // meta description, 140-160 символов с ключом
  publishedAt: string; // ISO date
  updatedAt?: string;
  category: NewsCategory;
  tags: string[];
  readingMinutes: number;
  content: string; // markdown-like text
  faq?: FaqItem[];
  related?: string[]; // slugs других постов
};

export const CATEGORY_LABELS: Record<NewsCategory, string> = {
  analytics: "Аналитика",
  inventory: "Запасы",
  marketplace: "Маркетплейсы",
  finance: "Финансы",
};

export const CATEGORY_COLORS: Record<NewsCategory, { text: string; bg: string }> = {
  analytics: { text: "text-azure", bg: "bg-azure/10" },
  inventory: { text: "text-lime-deep", bg: "bg-lime-soft" },
  marketplace: { text: "text-orange", bg: "bg-orange/10" },
  finance: { text: "text-emerald", bg: "bg-emerald/10" },
};

// Базовый URL для canonical/sitemap/JSON-LD. Берём из env с фоллбеком.
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://veloseller.ru").replace(/\/+$/, "");
