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
  // Дата последнего существенного обновления статьи (ISO). Если не задана —
  // в Article JSON-LD dateModified падает на publishedAt. Обновляйте при правках
  // контента: Google использует dateModified для свежести в выдаче.
  updatedAt?: string;
  category: NewsCategory;
  readingMinutes: number;
  content: string;
  // Опциональные поля: явные связанные посты и теги для подбора похожих.
  // Если у поста их нет — getRelatedPosts падает обратно на категорию.
  tags?: string[];
  related?: string[];
};
