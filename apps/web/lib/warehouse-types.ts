/**
 * Клиент-safe типы и helpers для multi-warehouse.
 *
 * Этот файл НЕ импортирует next/headers — безопасен для use client компонентов.
 * Server-only логика (cookies, supabase) в warehouse.ts.
 *
 * Причина разделения: WarehouseSelector.tsx это "use client" компонент,
 * в Next.js client component не может даже transitive-импортировать next/headers.
 */

export type SelectedWarehouse = {
  id: string;
  name: string;
  warehouse_kind: string;
  status: string;
  // ISO timestamp когда юзер подключил источник. Используется в SKU-странице
  // для min даты в календаре "Период с датами" — данных до подключения нет.
  created_at: string | null;
};

export type WarehouseListItem = {
  id: string;
  name: string;
  warehouse_kind: string;
  status: string;
};

export const WAREHOUSE_COOKIE_NAME = "vs-warehouse";
export const WAREHOUSE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 год

/**
 * Отображаемое название типа склада. Можно вызывать откуда угодно.
 */
export function warehouseKindLabel(kind: string | null | undefined): string {
  if (!kind) return "—";
  return ({
    ozon_fbo:     "Ozon FBO",
    ozon_fbs:     "Ozon FBS",
    wb_fbo:       "Wildberries FBO",
    wb_fbs:       "Wildberries FBS",
    google_sheet: "Google Sheet",
    shopify:      "Shopify",
  } as Record<string, string>)[kind] ?? kind;
}
