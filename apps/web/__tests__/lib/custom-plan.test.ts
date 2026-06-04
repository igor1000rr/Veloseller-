/**
 * Тесты тарифа «Конструктор» (lib/custom-plan) — формула цены, кодировка,
 * парсинг и границы валидации. Формула: склады×1000 + (SKU/1000)×500.
 */
import { describe, it, expect } from "vitest";
import {
  customPlanPrice,
  customPlanId,
  parseCustomPlanId,
  isValidCustomParams,
  customPlanLabel,
} from "@/lib/custom-plan";

describe("custom-plan — цена", () => {
  it("Старт-эквивалент: 2 склада × 1000 SKU = 2500 ₽ (совпадает с фикс-тарифом)", () => {
    expect(customPlanPrice({ warehouses: 2, skuPerWarehouse: 1000 })).toBe(2500);
  });

  it("5 складов × 2000 SKU = 6000 ₽", () => {
    expect(customPlanPrice({ warehouses: 5, skuPerWarehouse: 2000 })).toBe(6000);
  });

  it("минимум: 1 × 1000 = 1500 ₽", () => {
    expect(customPlanPrice({ warehouses: 1, skuPerWarehouse: 1000 })).toBe(1500);
  });

  it("максимум: 20 × 20000 = 30000 ₽", () => {
    expect(customPlanPrice({ warehouses: 20, skuPerWarehouse: 20000 })).toBe(30000);
  });
});

describe("custom-plan — кодировка и парсинг", () => {
  it("customPlanId → custom_{wh}x{sku}", () => {
    expect(customPlanId({ warehouses: 5, skuPerWarehouse: 2000 })).toBe("custom_5x2000");
  });

  it("roundtrip: parse(id(p)) === p", () => {
    const p = { warehouses: 12, skuPerWarehouse: 17000 };
    expect(parseCustomPlanId(customPlanId(p))).toEqual(p);
  });

  it("label содержит параметры", () => {
    expect(customPlanLabel({ warehouses: 5, skuPerWarehouse: 2000 })).toContain("5");
    expect(customPlanLabel({ warehouses: 5, skuPerWarehouse: 2000 })).toContain("Конструктор");
  });

  it("не парсит фикс-тарифы и мусор", () => {
    expect(parseCustomPlanId("starter")).toBeNull();
    expect(parseCustomPlanId("growth")).toBeNull();
    expect(parseCustomPlanId("custom_")).toBeNull();
    expect(parseCustomPlanId("custom_x")).toBeNull();
    expect(parseCustomPlanId("custom_5x2000x1")).toBeNull();
  });

  it("отбрасывает значения вне диапазонов", () => {
    expect(parseCustomPlanId("custom_0x1000")).toBeNull();   // складов < 1
    expect(parseCustomPlanId("custom_21x1000")).toBeNull();  // складов > 20
    expect(parseCustomPlanId("custom_5x21000")).toBeNull();  // SKU > 20000
    expect(parseCustomPlanId("custom_5x1500")).toBeNull();   // SKU не кратно 1000
  });

  it("isValidCustomParams отбрасывает дробные значения", () => {
    expect(isValidCustomParams({ warehouses: 2.5, skuPerWarehouse: 1000 })).toBe(false);
    expect(isValidCustomParams({ warehouses: 2, skuPerWarehouse: 1000 })).toBe(true);
  });
});
