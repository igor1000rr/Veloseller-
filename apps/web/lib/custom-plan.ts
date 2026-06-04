/**
 * Тариф «Конструктор» (Александр 04.06.2026) — изоморфный модуль.
 *
 * Пользователь сам собирает тариф: 1–20 складов × 1000–20000 SKU/склад.
 * Цена: склад — 1000 ₽/мес, каждые 1000 SKU на склад — 500 ₽/мес.
 * Проверка формулы: Старт (2 склада, 1000 SKU) = 2×1000 + 1×500 = 2500 ₽ —
 * совпадает с фиксированной ценой тарифа Старт.
 *
 * Кодировка плана: `custom_{warehouses}x{skuPerWarehouse}` (напр. custom_5x2000) —
 * хранится в robokassa_invoices.plan и sellers.plan как обычная строка,
 * миграция инвойсов не нужна. Сумма ВСЕГДА считается на сервере из кодировки —
 * клиентская цена не принимается.
 *
 * ВАЖНО: модуль импортируется и клиентом (PlanBuilder), и сервером (robokassa) —
 * никаких node-зависимостей здесь быть не должно.
 */

export const CUSTOM_WAREHOUSES_MIN = 1;
export const CUSTOM_WAREHOUSES_MAX = 20;
export const CUSTOM_SKU_MIN = 1000;
export const CUSTOM_SKU_MAX = 20000;
export const CUSTOM_SKU_STEP = 1000;

/** ₽/мес за один склад. */
export const CUSTOM_PRICE_PER_WAREHOUSE = 1000;
/** ₽/мес за каждые 1000 SKU на склад. */
export const CUSTOM_PRICE_PER_1000_SKU = 500;

export type CustomPlanParams = {
  warehouses: number;
  skuPerWarehouse: number;
};

export function isValidCustomParams(p: CustomPlanParams): boolean {
  return (
    Number.isInteger(p.warehouses) &&
    p.warehouses >= CUSTOM_WAREHOUSES_MIN &&
    p.warehouses <= CUSTOM_WAREHOUSES_MAX &&
    Number.isInteger(p.skuPerWarehouse) &&
    p.skuPerWarehouse >= CUSTOM_SKU_MIN &&
    p.skuPerWarehouse <= CUSTOM_SKU_MAX &&
    p.skuPerWarehouse % CUSTOM_SKU_STEP === 0
  );
}

/** Цена конструктора, ₽/мес: склады×1000 + (SKU/1000)×500. */
export function customPlanPrice(p: CustomPlanParams): number {
  return (
    p.warehouses * CUSTOM_PRICE_PER_WAREHOUSE +
    (p.skuPerWarehouse / 1000) * CUSTOM_PRICE_PER_1000_SKU
  );
}

/** Идентификатор плана для invoice/sellers: custom_5x2000. */
export function customPlanId(p: CustomPlanParams): string {
  return `custom_${p.warehouses}x${p.skuPerWarehouse}`;
}

/**
 * Парсит custom_{wh}x{sku}. Возвращает null для любых других строк
 * и для значений вне диапазонов/шага — невалидная кодировка не оплачивается
 * и не активируется.
 */
export function parseCustomPlanId(plan: string): CustomPlanParams | null {
  const m = /^custom_(\d{1,2})x(\d{4,5})$/.exec(plan);
  if (!m) return null;
  const params: CustomPlanParams = {
    warehouses: parseInt(m[1], 10),
    skuPerWarehouse: parseInt(m[2], 10),
  };
  return isValidCustomParams(params) ? params : null;
}

/** Человекочитаемое название для description Робокассы и UI. */
export function customPlanLabel(p: CustomPlanParams): string {
  return `Конструктор: ${p.warehouses} скл. × ${p.skuPerWarehouse.toLocaleString("ru-RU")} SKU`;
}
