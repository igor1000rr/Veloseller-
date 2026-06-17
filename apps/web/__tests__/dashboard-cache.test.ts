import { describe, it, expect, vi, beforeEach } from "vitest";

// Записываем аргументы, с которыми код дёргает БД, чтобы проверить:
// во ВСЕ запросы агрегатов прокидывается ровно переданный seller_id/connection.
const { rpcCalls, eqCalls, stampRow } = vi.hoisted(() => ({
  rpcCalls: [] as Array<{ name: string; params: any }>,
  eqCalls: [] as Array<{ col: string; val: any }>,
  stampRow: { value: { updated_at: "2026-06-15T07:55:21.061Z" } as any },
}));

// unstable_cache в тесте — сквозной (просто исполняет функцию).
vi.mock("next/cache", () => ({
  unstable_cache: (fn: any) => fn,
}));

// Подменяем service-role клиент фейком, который записывает вызовы.
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
    };
    return {
      from: () => qb,
      rpc: (name: string, params: any) => {
        rpcCalls.push({ name, params });
        const rows =
          name === "get_dashboard_velocities"
            ? [{ product_id: "p1", adjusted_velocity: 1.5, confidence_score: 0.8 }]
            : [{ total_sku_count: 1 }];
        return Promise.resolve({ data: rows, error: null });
      },
    };
  },
}));

import { getRecalcStamp, getDashboardComputed } from "@/lib/dashboard-cache";

beforeEach(() => {
  rpcCalls.length = 0;
  eqCalls.length = 0;
  stampRow.value = { updated_at: "2026-06-15T07:55:21.061Z" };
});

describe("dashboard-cache — изоляция арендатора", () => {
  it("обе RPC получают ровно переданный seller_id/connection/period", async () => {
    const res = await getDashboardComputed("seller-A", "conn-1", 30, "stamp-x");

    expect(rpcCalls).toHaveLength(2);
    for (const c of rpcCalls) {
      expect(c.params.p_seller_id).toBe("seller-A");
      expect(c.params.p_connection_id).toBe("conn-1");
    }
    const metrics = rpcCalls.find(
      (c) => c.name === "get_warehouse_dashboard_metrics",
    );
    expect(metrics?.params.p_period_days).toBe(30);

    expect(res.wm).not.toBeNull();
    expect(res.velRows[0]?.product_id).toBe("p1");
  });

  it("seller_id не захардкожен — разные значения прокидываются как есть", async () => {
    await getDashboardComputed("seller-B", "conn-2", 7, "stamp-y");
    expect(rpcCalls.every((c) => c.params.p_seller_id === "seller-B")).toBe(true);
    expect(rpcCalls.every((c) => c.params.p_connection_id === "conn-2")).toBe(true);
  });

  it("getRecalcStamp фильтрует recalc_jobs по seller_id и возвращает updated_at", async () => {
    const stamp = await getRecalcStamp("seller-A");
    expect(eqCalls).toContainEqual({ col: "seller_id", val: "seller-A" });
    expect(stamp).toBe("2026-06-15T07:55:21.061Z");
  });

  it("getRecalcStamp → 'none', если строки пересчёта нет", async () => {
    stampRow.value = null;
    const stamp = await getRecalcStamp("seller-A");
    expect(stamp).toBe("none");
  });
});
