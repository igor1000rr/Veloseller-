"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";

export function RadarFilters({
  currentBrand,
  currentSearch,
  brands,
}: {
  currentBrand: string;
  currentSearch: string;
  brands: Array<{ id: string; name: string; sku_count: number }>;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [search, setSearch] = useState(currentSearch);

  // Дебаунс поиска: применяем через 400 мс после остановки ввода
  useEffect(() => {
    if (search === currentSearch) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams(sp.toString());
      if (search) params.set("q", search);
      else params.delete("q");
      router.replace(`/dashboard/radar?${params.toString()}`);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function changeBrand(brandId: string) {
    const params = new URLSearchParams(sp.toString());
    if (brandId) params.set("brand", brandId);
    else params.delete("brand");
    router.replace(`/dashboard/radar?${params.toString()}`);
  }

  return (
    <div className="flex gap-3 flex-wrap items-center">
      <div className="relative flex-1 min-w-[200px]">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по запросу"
          className="w-full px-3 py-2 rounded-lg border border-line bg-paper text-sm placeholder:text-ink-hush focus:border-lime-deep/40 outline-none transition"
        />
      </div>

      <select
        value={currentBrand}
        onChange={(e) => changeBrand(e.target.value)}
        className="px-3 py-2 rounded-lg border border-line bg-paper text-sm text-ink min-w-[180px] focus:border-lime-deep/40 outline-none transition"
      >
        <option value="">Все бренды ({brands.length})</option>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name} {b.sku_count > 0 ? `(${b.sku_count} SKU)` : ""}
          </option>
        ))}
      </select>

      {(currentBrand || currentSearch) && (
        <button
          onClick={() => {
            setSearch("");
            const params = new URLSearchParams();
            const tab = sp.get("tab");
            if (tab) params.set("tab", tab);
            router.replace(`/dashboard/radar?${params.toString()}`);
          }}
          className="px-3 py-2 rounded-lg border border-line bg-bg-soft text-sm text-ink-muted hover:border-rose/40 hover:text-rose transition"
        >
          Сбросить
        </button>
      )}
    </div>
  );
}
