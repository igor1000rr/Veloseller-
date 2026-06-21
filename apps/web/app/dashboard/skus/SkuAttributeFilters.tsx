"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LOCALE } from "@/lib/features";

const isEn = LOCALE === "en";

/**
 * Правки 12 (#3): выпадающие фильтры таблицы SKU по бренду / категории / тегу.
 * Значения тянутся из RPC get_skus_facets (см. page.tsx) — distinct по селлеру.
 * Применяются мгновенно (как чипы и поиск): пишут ?brand/?category/?tag в URL
 * и перерисовывают список. Если у селлера нет значений типа — селект скрыт.
 */
export function SkuAttributeFilters({
  brands,
  categories,
  tags,
}: {
  brands: string[];
  categories: string[];
  tags: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  if (brands.length === 0 && categories.length === 0 && tags.length === 0) {
    return null;
  }

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value === "") params.delete(key);
    else params.set(key, value);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  const cls =
    "min-h-[36px] max-w-[170px] px-2 py-1.5 border border-line rounded-lg bg-paper text-xs text-ink-soft focus:outline-none focus:border-lime-deep";

  return (
    <div className="inline-flex items-center gap-2 flex-wrap">
      {brands.length > 0 && (
        <select
          className={cls}
          value={sp.get("brand") ?? ""}
          onChange={(e) => setParam("brand", e.target.value)}
          title={isEn ? "Filter by brand" : "Фильтр по бренду"}
        >
          <option value="">{isEn ? "All brands" : "Все бренды"}</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      )}
      {categories.length > 0 && (
        <select
          className={cls}
          value={sp.get("category") ?? ""}
          onChange={(e) => setParam("category", e.target.value)}
          title={isEn ? "Filter by category" : "Фильтр по категории"}
        >
          <option value="">{isEn ? "All categories" : "Все категории"}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}
      {tags.length > 0 && (
        <select
          className={cls}
          value={sp.get("tag") ?? ""}
          onChange={(e) => setParam("tag", e.target.value)}
          title={isEn ? "Filter by tag" : "Фильтр по тегу"}
        >
          <option value="">{isEn ? "All tags" : "Все теги"}</option>
          {tags.map((tg) => (
            <option key={tg} value={tg}>
              #{tg}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
