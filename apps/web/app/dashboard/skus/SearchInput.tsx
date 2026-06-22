"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { t } from "@/lib/i18n";

/**
 * Отдельный поиск SKU. Вынесен из SkusFilters в свой компонент чтобы
 * можно было разместить в строке вместе с сегментами и кнопками экспорта
 * (по paint-скрину Александра 27.05.2026).
 *
 * State в URL (q=). Дебаунс 350мс на push.
 */
export function SearchInput() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [value, setValue] = useState(sp.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedRef = useRef(false);

  // Синхронизация при back/forward или внешнем сбросе. Пока инпут в фокусе
  // (юзер печатает) НЕ перетираем локальное значение эхом из URL — иначе
  // debounced router.replace гонится с вводом и теряет символы.
  useEffect(() => {
    if (focusedRef.current) return;
    setValue(sp.get("q") ?? "");
  }, [sp]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const onChange = (v: string) => {
    setValue(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(sp.toString());
      if (v) params.set("q", v);
      else params.delete("q");
      params.delete("page");
      router.replace(`${pathname}?${params.toString()}`);
    }, 350);
  };

  return (
    <div className="w-full sm:flex-1 sm:min-w-[260px] sm:max-w-md relative">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => { focusedRef.current = true; }}
        onBlur={() => { focusedRef.current = false; }}
        placeholder={t("sku.search.placeholder")}
        className="w-full px-3 py-2 pl-9 border border-line rounded-lg text-sm bg-paper focus:outline-none focus:border-lime-deep transition min-h-[40px]"
      />
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-hush text-sm">⌕</span>
    </div>
  );
}
