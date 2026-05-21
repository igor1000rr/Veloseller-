/**
 * Server-only helpers для multi-warehouse дашборда.
 *
 * Этот файл ИМПОРТИРУЕТ next/headers — НЕ вызывать из "use client" компонентов.
 * Клиентские типы и labels в lib/warehouse-types.ts.
 *
 * Решение Александра: «Нет «Все склады» совсем» — данные показываются только
 * по одному выбранному складу. ID в cookie vs-warehouse, читается server-side.
 */
import { cookies } from "next/headers";
import {
  WAREHOUSE_COOKIE_NAME,
  type SelectedWarehouse,
  type WarehouseListItem,
} from "./warehouse-types";

// Re-export для обратной совместимости — существующие server-импорты из "@/lib/warehouse"
// должны продолжать работать (в layouts и dashboard/page).
export type { SelectedWarehouse, WarehouseListItem } from "./warehouse-types";
export {
  WAREHOUSE_COOKIE_NAME,
  WAREHOUSE_COOKIE_MAX_AGE,
  warehouseKindLabel,
} from "./warehouse-types";

/**
 * Список всех складов пользователя для селектора. Сортирует по дате создания (новые сверху).
 */
export async function listWarehouses(
  supabase: any,
  userId: string,
): Promise<WarehouseListItem[]> {
  const { data } = await supabase
    .from("data_connections")
    .select("id, name, warehouse_kind, status")
    .eq("seller_id", userId)
    .order("created_at", { ascending: false });
  return (data ?? []) as WarehouseListItem[];
}

/**
 * Текущий выбранный склад пользователя — cookie vs-warehouse или fallback на первый из списка.
 */
export async function getSelectedWarehouse(
  supabase: any,
  userId: string,
): Promise<SelectedWarehouse | null> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(WAREHOUSE_COOKIE_NAME)?.value;

  const warehouses = await listWarehouses(supabase, userId);
  if (warehouses.length === 0) return null;

  if (cookieValue) {
    const match = warehouses.find((w) => w.id === cookieValue);
    if (match) return match;
  }

  return warehouses[0];
}
