"""Store- и warehouse-агрегаты recalc + их запись.

Вынесено из recalc.py 05.06.2026 (инцидент egress) без изменения формул.
recalc.py реэкспортирует эти функции — внешние импорты не меняются.
Записи идут через execute_minimal (Prefer: return=minimal) — PostgREST
не возвращает тела строк, экономя egress.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.db import execute_minimal
from app.engine.lost_revenue import average_stockout_price
from app.engine.store import (
    SkuHealthInput, SkuValue, concentration_50, demand_weight,
    total_inventory_value, warehouse_health_score,
)
from app.schemas import EventType, InventorySegment

logger = logging.getLogger("veloseller.recalc")


def _compute_aggregates(sku_data):
    """Вычисляет агрегаты для группы SKU. Используется и store_metrics, и
    warehouse_metrics — гарантирует идентичные формулы.

    Возвращает dict с полями для upsert (без seller_id / period_* /
    connection_id — их добавляет вызывающий код).

    Логика (правка 4.1 Александра — see _write_store_metrics):
    - Активные SKU (availability_now OR has_movements) — для health,
      концентраций, денег, distribution.
    - Все SKU (включая inactive) — для счётчиков и lost_revenue.
    - Inactive = ~availability_now AND ~has_movements.
    - "Нет в наличии" (active_oos) = oos - inactive.
    """
    if not sku_data:
        return None

    active_sku_data = [
        item for item in sku_data
        if item["availability_now"] or item.get("has_movements", True)
    ]

    sku_health_inputs = [
        SkuHealthInput(
            product_id=item["pid"],
            health_score=item["metric"].sku_health_score or 0,
            stock_quantity=item["current_stock"],
            price=item["current_price"],
            adjusted_velocity=item["metric"].adjusted_velocity,
            median_30d_velocity=item["metric"].median_30d_velocity,
            is_out_of_stock=not item["availability_now"],
        )
        for item in active_sku_data
    ]
    inv_items = [SkuValue(s.product_id, s.stock_quantity * s.price) for s in sku_health_inputs]
    dem_items = [
        SkuValue(s.product_id, demand_weight(s.adjusted_velocity, s.median_30d_velocity, s.price))
        for s in sku_health_inputs
    ]
    inv_conc = concentration_50(inv_items)
    dem_conc = concentration_50(dem_items)
    total_value = total_inventory_value(sku_health_inputs)
    # Замороженные деньги = сумма stock×price по SKU с сегментом DEAD_INVENTORY_RISK.
    # Сегмент — единый источник правды неликвида: покрывает и coverage > 180, и
    # «мёртвый по скорости» (adj_vel=0 при долгом наличии без продаж), который раньше
    # с coverage=None молча выпадал из frozen.
    frozen_value = sum(
        item["current_stock"] * item["current_price"]
        for item in active_sku_data
        if item["metric"].segment == InventorySegment.DEAD_INVENTORY_RISK
    )
    wh_score = warehouse_health_score(sku_health_inputs)
    seg_distribution = {}
    for item in active_sku_data:
        seg = (item["metric"].segment.value if item["metric"].segment else "insufficient_data")
        seg_distribution[seg] = seg_distribution.get(seg, 0) + 1

    # Счётчики — по всем SKU (включая inactive). Иначе total_sku_count будет
    # неконсистентен с тем, что показывается на вкладке SKU при include_inactive=1.
    oos_count = sum(1 for item in sku_data if not item["availability_now"])
    low_count = sum(
        1 for item in sku_data
        if item["metric"].coverage_days is not None and item["metric"].coverage_days <= 7
    )
    dead_count = sum(
        1 for item in sku_data
        if item["metric"].segment == InventorySegment.DEAD_INVENTORY_RISK
    )

    # inactive_sku_count — SKU с нулевым остатком И без движений за период.
    # На фронте они скрываются по умолчанию (правка 1 Александра).
    inactive_count = sum(
        1 for item in sku_data
        if not item["availability_now"] and not item.get("has_movements", True)
    )

    # frequently_oos_sku_count — SKU где stockout_days > 15 за период.
    # Сигнал систематической проблемы с поставками.
    frequently_oos_count = sum(
        1 for item in sku_data
        if item["metric"].stockout_days > 15
    )

    # Правка 2 Александра: "Нет в наличии" = товары с нулевым остатком,
    # ПО КОТОРЫМ БЫЛО ДВИЖЕНИЕ за 30 дней. Из oos_count вычитаем inactive
    # → активный OOS, то чем реально надо заниматься.
    active_oos_count = max(0, oos_count - inactive_count)

    # lost_revenue — по всем SKU. У inactive естественно = 0 (нет velocity
    # или stockout_days = 0), поэтому фильтрация не нужна.
    lost_total = 0.0
    for item in sku_data:
        m = item["metric"]
        if m.adjusted_velocity <= 0 or m.stockout_days <= 0:
            continue
        prices_during_stockout = [
            a.price for a in item.get("aggregates", [])
            if not a.availability
            and a.event_type != EventType.MISSING_DATA
            and a.price > 0
        ]
        avg_price = average_stockout_price(prices_during_stockout, item["current_price"])
        lost_total += m.adjusted_velocity * m.stockout_days * avg_price

    return {
        "total_sku_count": len(sku_data),
        "oos_sku_count": active_oos_count,
        "low_stock_sku_count": low_count,
        "dead_inventory_sku_count": dead_count,
        "inactive_sku_count": inactive_count,
        "frequently_oos_sku_count": frequently_oos_count,
        "inventory_concentration_50": inv_conc,
        "demand_concentration_50": dem_conc,
        "total_inventory_value": float(total_value),
        "store_frozen_inventory_value": float(frozen_value),
        "lost_revenue": float(lost_total),
        "warehouse_health_score": float(wh_score) if wh_score is not None else None,
        "demand_pattern_distribution": seg_distribution,
    }


def _write_store_metrics(sb, seller_id, sku_data, period_start, period_end):
    """Записывает store_metrics — агрегат по всему магазину (всем складам).

    computed_at передаём явно: DEFAULT now() в БД срабатывает только при INSERT.
    При UPSERT-UPDATE без явной передачи computed_at останется старым, и
    SELECT по computed_at >= X на фронте не увидит обновлённую запись.
    """
    aggregates = _compute_aggregates(sku_data)
    if aggregates is None:
        return 0

    row = {
        "seller_id": seller_id,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "computed_at": datetime.now(timezone.utc).isoformat(),
        **aggregates,
    }
    execute_minimal(sb.table("store_metrics").upsert(
        row, on_conflict="seller_id,period_start,period_end"
    ))
    return 1


def _write_warehouse_metrics(sb, seller_id, sku_data, period_start, period_end):
    """Записывает warehouse_metrics — по одной строке на каждый склад.

    Правка 10 этап 2 (25.05.2026). Группирует sku_data по connection_id
    и для каждого склада считает те же агрегаты что и store_metrics
    (через общую _compute_aggregates). Используется для графиков
    динамики /dashboard (Health/LostRevenue/DeadInventory) выбранного
    склада.

    Легаси-продукты без connection_id (если есть) пропускаются — попадают
    только в store_metrics.

    computed_at передаём явно по той же причине что и в _write_store_metrics:
    DEFAULT now() не срабатывает при UPDATE.
    """
    if not sku_data:
        return 0

    by_connection = {}
    for item in sku_data:
        conn_id = item.get("connection_id")
        if not conn_id:
            continue
        by_connection.setdefault(conn_id, []).append(item)

    now_iso = datetime.now(timezone.utc).isoformat()

    written = 0
    for conn_id, items in by_connection.items():
        try:
            aggregates = _compute_aggregates(items)
            if aggregates is None:
                continue
            row = {
                "seller_id": seller_id,
                "connection_id": conn_id,
                "period_start": period_start.isoformat(),
                "period_end": period_end.isoformat(),
                "computed_at": now_iso,
                **aggregates,
            }
            execute_minimal(sb.table("warehouse_metrics").upsert(
                row, on_conflict="seller_id,connection_id,period_start,period_end"
            ))
            written += 1
        except Exception:
            # Не падаем на одном складе — пишем остальные. Ошибка
            # фиксируется в логе для диагностики.
            logger.exception("warehouse_metrics row failed", extra={
                "seller_id": seller_id, "connection_id": conn_id,
                "period_start": period_start.isoformat(),
            })
    return written
