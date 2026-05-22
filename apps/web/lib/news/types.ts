// Типы и константы для системы блога/новостей.
// Контент хранится в posts.ts как массив объектов NewsPost.
// content — markdown-style текст, рендерится через render.tsx (без внешних зависимостей).

export type NewsCategory = "marketplace" | "analytics" | "inventory" | "finance";

export type NewsPost = {
  slug: string;
  title: string;
  /** Короткое описание для meta description + листинга (до 160 символов) */
  description: string;
  /** ISO 8601 дата публикации */
  publishedAt: string;
  /** ISO 8601 дата обновления (опционально) */
  updatedAt?: string;
  category: NewsCategory;
  /** Ключевые слова для meta keywords и внутренней перелинковки */
  tags: string[];
  /** Время чтения в минутах (ручной оценки) */
  readingMinutes: number;
  /** Markdown-style тело поста */
  content: string;
};

export const CATEGORY_LABELS: Record<NewsCategory, string> = {
  marketplace: "Маркетплейсы",
  analytics: "Аналитика",
  inventory: "Запасы",
  finance: "Финансы",
};

/** Tailwind классы для бэйджа категории (из системной палитры лендинга) */
export const CATEGORY_BADGE: Record<NewsCategory, string> = {
  marketplace: "text-orange bg-orange/10 border-orange/20",
  analytics: "text-azure bg-azure/10 border-azure/20",
  inventory: "text-lime-deep bg-lime-soft border-lime-deep/20",
  finance: "text-emerald bg-emerald/10 border-emerald/20",
};
