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
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import {
  WAREHOUSE_COOKIE_NAME,
  type SelectedWarehouse,
  type WarehouseListItem,
} from "./warehouse-types";

type Db = SupabaseClient<Database>;

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
  supabase: Db,
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
 * Включает created_at для использования в календарных фильтрах.
 */
export async function getSelectedWarehouse(
  supabase: Db,
  userId: string,
): Promise<SelectedWarehouse | null> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(WAREHOUSE_COOKIE_NAME)?.value;

  // Тут отдельный запрос с created_at — listWarehouses возвращает упрощённый тип
  // без даты создания (для UI селектора она не нужна).
  const { data } = await supabase
    .from("data_connections")
    .select("id, name, warehouse_kind, status, created_at")
    .eq("seller_id", userId)
    .order("created_at", { ascending: false });

  const warehouses = (data ?? []) as SelectedWarehouse[];
  if (warehouses.length === 0) return null;

  if (cookieValue) {
    const match = warehouses.find((w) => w.id === cookieValue);
    if (match) return match;
  }

  return warehouses[0];
}
