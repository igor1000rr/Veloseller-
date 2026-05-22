export type NewsCategory = 'wildberries' | 'ozon' | 'inventory' | 'finance';

export const CATEGORY_LABELS: Record<NewsCategory, string> = {
  wildberries: 'Wildberries',
  ozon: 'Ozon',
  inventory: 'Управление запасами',
  finance: 'Финансы',
};

export const CATEGORY_COLORS: Record<NewsCategory, string> = {
  wildberries: 'text-rose bg-rose/10 border-rose/20',
  ozon: 'text-azure bg-azure/10 border-azure/20',
  inventory: 'text-lime-deep bg-lime-soft border-lime-deep/20',
  finance: 'text-emerald bg-emerald/10 border-emerald/20',
};

export type NewsPost = {
  slug: string;
  title: string;
  description: string;
  keywords: string[];
  publishedAt: string;
  category: NewsCategory;
  readingMinutes: number;
  content: string;
};
