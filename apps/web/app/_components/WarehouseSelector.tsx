"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icons } from "./Icons";
import { warehouseKindLabel, type WarehouseListItem } from "@/lib/warehouse-types";

/**
 * Селектор склада для AppHeader.
 *
 * forceVisible: при true — кнопка видима на всех экранах (для мобильного меню).
 *               По умолчанию (false) — hidden sm:inline-flex (только десктоп в header).
 */
export default function WarehouseSelector({
  warehouses, selectedId, forceVisible = false,
}: {
  warehouses: WarehouseListItem[];
  selectedId: string | null;
  forceVisible?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const visibilityCls = forceVisible ? "inline-flex w-full" : "hidden sm:inline-flex";

  if (warehouses.length === 0) {
    return (
      <Link
        href={"/connections/new"}
        className={`${visibilityCls} items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-orange/30 bg-orange/10 text-orange hover:bg-orange/15 transition`}
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
          // Igor 09.06: при смене склада уводим на «Обзор». Иначе юзер остаётся
          // на узкой вкладке (SKU другого склада, Динамика и т.п.) с чужим контекстом.
          router.push("/dashboard");
          router.refresh();
        }
      } catch {
        // тихий fail
      }
    });
  }

  return (
    <div className={`relative ${forceVisible ? "w-full" : ""}`}>
      <button
        onClick={() => hasMultiple && setOpen(!open)}
        disabled={!hasMultiple || pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${visibilityCls} ${forceVisible ? "justify-between" : ""} items-center gap-1.5 px-2 py-1.5 rounded-md border transition min-h-[32px] ${
          hasMultiple
            ? "border-line bg-paper text-ink hover:border-lime-deep/40 cursor-pointer"
            : "border-line bg-paper text-ink cursor-default"
        } ${pending ? "opacity-50" : ""}`}
        aria-label="Выбрать склад"
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="size-1.5 rounded-full bg-lime-deep shrink-0" />
          {/* Имя склада: на узких экранах max-w больше чтобы не обрезалось до "T...".
              На xl+ (где появляется навигация) сжимаем чтобы не отвлекать. */}
          <span className={`${forceVisible ? "" : "max-w-[200px] xl:max-w-[140px]"} truncate text-xs font-medium`}>{selected.name}</span>
          <span className="font-mono text-[9px] text-ink-hush uppercase shrink-0">
            {warehouseKindLabel(selected.warehouse_kind)}
          </span>
        </span>
        {hasMultiple && (
          <span className={`transition-transform shrink-0 ${open ? "rotate-180" : ""}`}>
            <Icons.ArrowRight size={9} />
          </span>
        )}
      </button>

      {open && hasMultiple && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 right-0 sm:left-auto sm:right-0 top-full mt-1.5 z-50 min-w-[260px] rounded-lg border border-line bg-paper shadow-xl overflow-hidden"
            style={{ backgroundColor: "#ffffff" }}
          >
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
                      className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition min-h-[44px] ${
                        isSel ? "bg-lime-soft" : "hover:bg-bg-soft"
                      }`}
                    >
                      <span className={`size-1.5 rounded-full shrink-0 ${
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
                      {isSel && <span className="text-lime-deep shrink-0"><Icons.Check size={12} /></span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-line">
              <Link
                href={"/connections/new"}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 text-sm text-ink-muted hover:bg-bg-soft hover:text-lime-deep transition min-h-[44px]"
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
