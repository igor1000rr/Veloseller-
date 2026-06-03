"use client";
import { useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { t } from "@/lib/i18n";

/**
 * Поиск по SKU/названию для вкладки Динамика.
 * Сохраняет остальные query-параметры (например ?period=week) при апдейте.
 * Mobile-friendly: input full-width на мобиле, sm:w-64 на десктопе.
 */
export default function DynamicsSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [val, setVal] = useState(initial);
  const [pending, startTransition] = useTransition();

  function submit(v: string) {
    const params = new URLSearchParams(sp.toString());
    if (v.trim()) params.set("q", v.trim());
    else params.delete("q");
    const qs = params.toString();
    startTransition(() => {
      router.push(`${pathname}${qs ? `?${qs}` : ""}` as any);
    });
  }

  return (
    <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap sm:flex-nowrap">
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(val); }}
        placeholder={t("dynamics.search.placeholder")}
        className="flex-1 sm:flex-initial w-full sm:w-64 px-3 py-2 rounded-md border border-line bg-paper text-sm focus:outline-none focus:border-lime-deep/40 transition min-h-[40px]"
      />
      {val && (
        <button
          onClick={() => { setVal(""); submit(""); }}
          className="px-2 py-2 rounded border border-line text-xs font-mono uppercase tracking-wider text-ink-muted hover:bg-bg-soft transition"
        >{t("dynamics.search.reset")}</button>
      )}
      <button
        onClick={() => submit(val)}
        disabled={pending}
        className="px-3 py-2 rounded-md bg-ink text-paper text-xs font-mono uppercase tracking-wider hover:bg-ink-soft disabled:opacity-50 transition"
      >
        {pending ? "..." : t("dynamics.search.find")}
      </button>
    </div>
  );
}
