"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Принудительно обновляет server components при возврате на страницу.
 *
 * Решает 3 кейса где данные могут устареть:
 *  1. **bfcache** (Back-Forward Cache в Chrome/Safari) — браузер показывает
 *     сохранённый снимок страницы при back/forward, игнорируя Cache-Control.
 *     event.persisted=true → нужно форсить refresh.
 *  2. **focus** — пользователь вернулся на вкладку из другого окна/таба
 *     после изменений (например, после оплаты в Робокассе в новой вкладке).
 *  3. **visibilitychange** — таб снова стал видимым после фонового состояния.
 *
 * Монтируется один раз в dashboard layout, работает для всех вложенных страниц.
 */
export default function FreshDataGuard() {
  const router = useRouter();

  useEffect(() => {
    // 1. bfcache (back/forward navigation)
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) router.refresh();
    };

    // 2. focus возврата на вкладку
    const onFocus = () => router.refresh();

    // 3. visibility смены (минимизация → восстановление)
    const onVisibility = () => {
      if (document.visibilityState === "visible") router.refresh();
    };

    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

  return null;
}
