/**
 * Управление выбранным складом для multi-warehouse дашборда.
 *
 * Решение Александра: «Нет «Все склады» совсем» — данные показываются только
 * по одному выбранному складу. ID хранится в cookie vs-warehouse и читается
 * server-side при каждом рендере dashboard страниц.
 */
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

const COOKIE_NAME = "vs-warehouse";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 год

export type SelectedWarehouse = {
  id: string;
  name: string;
  warehouse_kind: string;
  status: string;
};

export type WarehouseListItem = {
  id: string;
  name: string;
  warehouse_kind: string;
  status: string;
};

/**
 * Возвращает список всех складов пользователя для селектора.
 * Сортирует по дате создания (новые сверху).
 */
export async function listWarehouses(
  supabase: SupabaseClient,
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
 * Возвращает текущий выбранный склад пользователя.
 *
 * Логика:
 *  1. Читаем cookie vs-warehouse — это ID склада, выбранного в селекторе.
 *  2. Проверяем что этот склад принадлежит пользователю и существует.
 *     (Защита от подмены cookie + случая когда склад удалён.)
 *  3. Если cookie невалидно — берём первый склад из списка.
 *  4. Если у пользователя нет складов — возвращаем null.
 */
export async function getSelectedWarehouse(
  supabase: SupabaseClient,
  userId: string,
): Promise<SelectedWarehouse | null> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(COOKIE_NAME)?.value;

  const warehouses = await listWarehouses(supabase, userId);
  if (warehouses.length === 0) return null;

  // Проверяем что cookie указывает на реальный склад пользователя
  if (cookieValue) {
    const match = warehouses.find((w) => w.id === cookieValue);
    if (match) return match;
  }

  // Fallback: первый по дате создания (новые сверху)
  return warehouses[0];
}

/**
 * Имя cookie для установки/чтения. Экспортируется для server actions.
 */
export const WAREHOUSE_COOKIE_NAME = COOKIE_NAME;
export const WAREHOUSE_COOKIE_MAX_AGE = COOKIE_MAX_AGE;

/**
 * Отображаемое название типа склада.
 */
export function warehouseKindLabel(kind: string | null | undefined): string {
  if (!kind) return "—";
  return ({
    ozon_fbo:     "Ozon FBO",
    ozon_fbs:     "Ozon FBS",
    wb_fbo:       "Wildberries FBO",
    wb_fbs:       "Wildberries FBS",
    google_sheet: "Google Sheet",
  } as Record<string, string>)[kind] ?? kind;
}
