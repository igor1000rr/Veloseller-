import { describe, it, expect, vi, beforeEach } from "vitest";

// Записываем аргументы, с которыми код дёргает БД, чтобы проверить:
// во ВСЕ запросы агрегатов прокидывается ровно переданный seller_id/connection.
const { rpcCalls, eqCalls, stampRow, wmRows } = vi.hoisted(() => ({
  rpcCalls: [] as Array<{ name: string; params: any }>,
  eqCalls: [] as Array<{ col: string; val: any }>,
  stampRow: { value: { computed_at: "2026-06-17T02:52:49.224Z" } as any },
  // Каноническая строка warehouse_metrics (30-дн окно за последний period_end).
  wmRows: {
    value: [
      {
        period_end: "2026-06-23", period_start: "2026-05-25",
        total_sku_count: 10, low_stock_sku_count: 3, oos_sku_count: 1,
        dead_inventory_sku_count: 2, inactive_sku_count: 0, frequently_oos_sku_count: 0,
        warehouse_health_score: 80, lost_revenue: 100, total_inventory_value: 1000,
        store_frozen_inventory_value: 50, inventory_concentration_50: 5,
        demand_concentration_50: 5, demand_pattern_distribution: {},
      },
    ] as any[],
  },
}));

// unstable_cache в тесте — сквозной (просто исполняет функцию).
vi.mock("next/cache", () => ({
  unstable_cache: (fn: any) => fn,
}));

// Подменяем service-role клиент фейком, который записывает вызовы. Query-builder
// одновременно chainable (для .maybeSingle() штампа) и awaitable (для запроса
// warehouse_metrics в fetchComputed) — через then().
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => {
    const qb: any = {
      select: () => qb,
      eq: (col: string, val: any) => {
        eqCalls.push({ col, val });
        return qb;
      },
      order: () => qb,
      limit: () => qb,
      maybeSingle: () => Promise.resolve({ data: stampRow.value, error: null }),
      then: (resolve: any) => resolve({ data: wmRows.value, error: null }),
    };
    return {
      from: () => qb,
      rpc: (name: string, params: any) => {
        rpcCalls.push({ name, params });
        const rows =
          name === "get_dashboard_velocities"
            ? [{ product_id: "p1", adjusted_velocity: 1.5, confidence_score: 0.8 }]
            : [];
        return Promise.resolve({ data: rows, error: null });
      },
    };
  },
}));

import { getMetricsStamp, getDashboardComputed } from "@/lib/dashboard-cache";

beforeEach(() => {
  rpcCalls.length = 0;
  eqCalls.length = 0;
  stampRow.value = { computed_at: "2026-06-17T02:52:49.224Z" };
});

describe("dashboard-cache — изоляция арендатора", () => {
  it("velocities-RPC и запрос warehouse_metrics скоупятся по seller_id/connection", async () => {
    const res = await getDashboardComputed("seller-A", "conn-1", 30, "stamp-x");

    // KPI теперь из таблицы warehouse_metrics (канон), velocities — единственная RPC.
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("get_dashboard_velocities");
    expect(rpcCalls[0].params.p_seller_id).toBe("seller-A");
    expect(rpcCalls[0].params.p_connection_id).toBe("conn-1");

    // Запрос warehouse_metrics фильтруется по обоим ключам арендатора.
    expect(eqCalls).toContainEqual({ col: "seller_id", val: "seller-A" });
    expect(eqCalls).toContainEqual({ col: "connection_id", val: "conn-1" });

    expect(res.wm).not.toBeNull();
    expect(res.wm?.low_stock_sku_count).toBe(3);
    expect(res.velRows[0]?.product_id).toBe("p1");
  });

  it("seller_id не захардкожен — разные значения прокидываются как есть", async () => {
    await getDashboardComputed("seller-B", "conn-2", 7, "stamp-y");
    expect(rpcCalls.every((c) => c.params.p_seller_id === "seller-B")).toBe(true);
    expect(rpcCalls.every((c) => c.params.p_connection_id === "conn-2")).toBe(true);
    expect(eqCalls).toContainEqual({ col: "seller_id", val: "seller-B" });
    expect(eqCalls).toContainEqual({ col: "connection_id", val: "conn-2" });
  });

  it("getMetricsStamp фильтрует warehouse_metrics по seller_id И connection_id", async () => {
    const stamp = await getMetricsStamp("seller-A", "conn-1");
    expect(eqCalls).toContainEqual({ col: "seller_id", val: "seller-A" });
    expect(eqCalls).toContainEqual({ col: "connection_id", val: "conn-1" });
    expect(stamp).toBe("2026-06-17T02:52:49.224Z");
  });

  it("getMetricsStamp → 'none', если метрик нет", async () => {
    stampRow.value = null;
    const stamp = await getMetricsStamp("seller-A", "conn-1");
    expect(stamp).toBe("none");
  });
});
