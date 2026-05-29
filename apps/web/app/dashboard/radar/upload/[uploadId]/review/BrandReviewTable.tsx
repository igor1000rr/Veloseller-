"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionBulkUpdateBrands } from "../../../actions";

type Brand = {
  id: string;
  name: string;
  status: "approved" | "excluded";
  sku_count: number | null;
  avg_price: number | null;
};

/**
 * Таблица для ревью брендов после загрузки прайса.
 * Фишка из обсуждения с Александром 28.05.2026 — мульти-выбор галочками
 * вместо ввода каждого бренда руками.
 *
 * Состояние клиентское (useState), submit отправляет всё одной server action.
 * Лимит тарифа считается на лету — счётчик зелёный/красный по краю лимита.
 */
export default function BrandReviewTable({
  brands,
  brandsLimit,
  otherApprovedCount,
}: {
  brands: Brand[];
  brandsLimit: number;
  /** Сколько approved брендов у селлера есть ВНЕ этого upload (другие прайсы, manual) */
  otherApprovedCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"sku_count" | "name">("sku_count");
  const [filter, setFilter] = useState("");

  // Текущий выбор — Set с id брендов которые approved (галочка стоит).
  // По умолчанию: брать что worker уже пометил approved (топ-N по sku_count).
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(brands.filter(b => b.status === "approved").map(b => b.id))
  );

  const totalAvailable = Math.max(0, brandsLimit - otherApprovedCount);
  const selectedCount = selected.size;
  const overLimit = selectedCount > totalAvailable;

  const sorted = useMemo(() => {
    const copy = [...brands];
    if (sortBy === "sku_count") {
      copy.sort((a, b) => (b.sku_count ?? 0) - (a.sku_count ?? 0));
    } else {
      copy.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    }
    if (filter.trim()) {
      const f = filter.toLowerCase().trim();
      return copy.filter(b => b.name.toLowerCase().includes(f));
    }
    return copy;
  }, [brands, sortBy, filter]);

  function toggle(id: string) {
    setError(null);
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setError(null);
    // Если выбраны все видимые — снимаем со всех видимых.
    // Иначе — добавляем все видимые в выбор.
    const visibleIds = sorted.map(b => b.id);
    const allVisibleSelected = visibleIds.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleIds.forEach(id => next.delete(id));
      } else {
        visibleIds.forEach(id => next.add(id));
      }
      return next;
    });
  }

  function selectTopN(n: number) {
    setError(null);
    // Берём топ-N по sku_count из ВСЕХ (не из отфильтрованных).
    const topIds = [...brands]
      .sort((a, b) => (b.sku_count ?? 0) - (a.sku_count ?? 0))
      .slice(0, n)
      .map(b => b.id);
    setSelected(new Set(topIds));
  }

  async function handleSubmit() {
    setError(null);
    const approved: string[] = [];
    const excluded: string[] = [];
    for (const b of brands) {
      if (selected.has(b.id)) approved.push(b.id);
      else excluded.push(b.id);
    }
    startTransition(async () => {
      try {
        await actionBulkUpdateBrands(approved, excluded);
        router.push("/dashboard/radar" as any);
      } catch (e: any) {
        setError(e?.message ?? "Не удалось сохранить");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Счётчик + быстрые действия */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className={`font-mono text-xs uppercase tracking-wider px-3 py-1.5 rounded ${
            overLimit
              ? "bg-rose/10 text-rose"
              : selectedCount === 0
                ? "bg-bg-soft text-ink-hush"
                : "bg-lime-soft text-lime-deep"
          }`}>
            Выбрано {selectedCount} из {totalAvailable}
            {otherApprovedCount > 0 && (
              <span className="ml-2 normal-case text-ink-hush">
                (+{otherApprovedCount} уже отслеживаются)
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={selectAll}
            className="font-mono text-[11px] uppercase tracking-wider text-ink-muted hover:text-ink transition"
          >
            {sorted.every(b => selected.has(b.id)) ? "Снять все" : "Выбрать все"}
          </button>
          {totalAvailable >= 10 && brands.length > 10 && (
            <button
              type="button"
              onClick={() => selectTopN(Math.min(10, totalAvailable))}
              className="font-mono text-[11px] uppercase tracking-wider text-ink-muted hover:text-ink transition"
            >
              Топ-10 по SKU
            </button>
          )}
          {totalAvailable >= 25 && brands.length > 25 && (
            <button
              type="button"
              onClick={() => selectTopN(Math.min(25, totalAvailable))}
              className="font-mono text-[11px] uppercase tracking-wider text-ink-muted hover:text-ink transition"
            >
              Топ-25
            </button>
          )}
          <button
            type="button"
            onClick={() => setSortBy(sortBy === "sku_count" ? "name" : "sku_count")}
            className="font-mono text-[11px] uppercase tracking-wider text-ink-muted hover:text-ink transition"
          >
            Сорт: {sortBy === "sku_count" ? "по SKU" : "по имени"}
          </button>
        </div>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Поиск бренда…"
          className="px-3 py-1.5 text-sm border border-line rounded-lg bg-paper focus:outline-none focus:ring-2 focus:ring-lime-deep/30 w-48"
        />
      </div>

      {/* Таблица */}
      <div className="rounded-2xl border border-line bg-paper overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-soft border-b border-line">
            <tr>
              <th className="px-4 py-3 w-10"></th>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Бренд</th>
              <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">SKU</th>
              <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Ср. цена</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink-muted text-sm">
                  Нет брендов по этому фильтру
                </td>
              </tr>
            )}
            {sorted.map((b) => {
              const isSelected = selected.has(b.id);
              return (
                <tr
                  key={b.id}
                  onClick={() => toggle(b.id)}
                  className={`border-b border-line last:border-0 cursor-pointer transition ${
                    isSelected ? "bg-lime-soft/30 hover:bg-lime-soft/50" : "hover:bg-bg-soft/40"
                  }`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(b.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="size-4 accent-lime-deep cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-ink">{b.name}</td>
                  <td className="px-4 py-3 text-right tabular text-ink-muted">
                    {b.sku_count || "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular text-ink-muted">
                    {b.avg_price ? `${Math.round(b.avg_price).toLocaleString("ru-RU")} ₽` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Submit */}
      {error && (
        <div className="rounded-lg border border-rose/30 bg-rose/5 px-4 py-3 text-sm text-rose">
          {error}
        </div>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending || overLimit}
          className="inline-flex items-center rounded-lg bg-lime-deep text-paper px-5 py-3 font-mono uppercase tracking-wider text-sm font-semibold hover:bg-lime-deep/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {pending ? "Сохранение…" : `Подтвердить выбор (${selectedCount})`}
        </button>
        {overLimit && (
          <span className="text-xs text-rose">
            Превышен лимит тарифа на {selectedCount - totalAvailable}. Снимите лишние галочки или обновите тариф.
          </span>
        )}
      </div>
    </div>
  );
}
