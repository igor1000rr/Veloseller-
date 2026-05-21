"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icons } from "./Icons";
import { warehouseKindLabel, type WarehouseListItem } from "@/lib/warehouse-types";

/**
 * Селектор склада для AppHeader. Multi-warehouse архитектура:
 * каждый склад = отдельные данные, переключение через cookie vs-warehouse.
 *
 * UI:
 * - 0 складов: ссылка "Подключите склад"
 * - 1 склад: показываем как индикатор без выпадашки
 * - 2+ складов: выпадающее меню с переключением
 *
 * Импорт типов именно из "@/lib/warehouse-types", НЕ из "@/lib/warehouse":
 * последний тянет next/headers и сломает build client component.
 */
export default function WarehouseSelector({
  warehouses, selectedId,
}: {
  warehouses: WarehouseListItem[];
  selectedId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (warehouses.length === 0) {
    return (
      <Link
        href={"/connections/new" as any}
        className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-orange/30 bg-orange/10 text-orange hover:bg-orange/15 transition"
      >
        <Icons.Plus size={11} />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] font-semibold">Подключить склад</span>
      </Link>
    );
  }

  const selected = warehouses.find((w) => w.id === selectedId) ?? warehouses[0];
  const hasMultiple = warehouses.length > 1;

  async function handleSelect(warehouseId: string) {
    setOpen(false);
    if (warehouseId === selected.id) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/warehouse/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ warehouse_id: warehouseId }),
        });
        if (res.ok) {
          router.refresh();
        }
      } catch {
        // тихий fail; пользователь увидит что не переключилось
      }
    });
  }

  return (
    <div className="relative">
      <button
        onClick={() => hasMultiple && setOpen(!open)}
        disabled={!hasMultiple || pending}
        className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition ${
          hasMultiple
            ? "border-line bg-bg-soft text-ink hover:border-lime-deep/40 cursor-pointer"
            : "border-line bg-bg-soft text-ink cursor-default"
        } ${pending ? "opacity-50" : ""}`}
        aria-label="Выбрать склад"
      >
        <span className="size-1.5 rounded-full bg-lime-deep" />
        <span className="max-w-[160px] truncate text-xs font-medium">{selected.name}</span>
        <span className="font-mono text-[9px] text-ink-hush uppercase">
          {warehouseKindLabel(selected.warehouse_kind)}
        </span>
        {hasMultiple && (
          <span className={`transition-transform ${open ? "rotate-180" : ""}`}>
            <Icons.ArrowRight size={9} />
          </span>
        )}
      </button>

      {open && hasMultiple && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-50 min-w-[260px] rounded-lg border border-line bg-paper shadow-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-line">
              <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-hush font-semibold">
                Выберите склад
              </div>
            </div>
            <ul className="max-h-[400px] overflow-y-auto">
              {warehouses.map((w) => {
                const isSel = w.id === selected.id;
                const isError = w.status === "error";
                const isPaused = w.status === "paused";
                return (
                  <li key={w.id}>
                    <button
                      onClick={() => handleSelect(w.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition ${
                        isSel ? "bg-lime-soft" : "hover:bg-bg-soft"
                      }`}
                    >
                      <span className={`size-1.5 rounded-full ${
                        isPaused ? "bg-orange" : isError ? "bg-rose" : "bg-lime-deep"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-ink truncate">{w.name}</div>
                        <div className="font-mono text-[10px] text-ink-hush uppercase mt-0.5">
                          {warehouseKindLabel(w.warehouse_kind)}
                          {isError && <span className="text-rose ml-1.5">· ошибка</span>}
                          {isPaused && <span className="text-orange ml-1.5">· пауза</span>}
                        </div>
                      </div>
                      {isSel && <span className="text-lime-deep"><Icons.Check size={12} /></span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-line">
              <Link
                href={"/connections/new" as any}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 text-sm text-ink-muted hover:bg-bg-soft hover:text-lime-deep transition"
              >
                <Icons.Plus size={12} />
                <span>Добавить склад</span>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
