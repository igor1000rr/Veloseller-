"use client";

import { useEffect } from "react";

/**
 * Error boundary для /dashboard/*. Ловит ошибки рендера компонентов дашборда —
 * вместо белого экрана показывает восстановимый UI с кнопкой повтора.
 * Деталь ошибки уходит в консоль (логи/Sentry), наружу не светим.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] render error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <span className="size-1.5 rounded-full bg-lime-deep" aria-hidden />
      <h2 className="font-display text-2xl font-medium text-ink">Что-то пошло не так</h2>
      <p className="max-w-md text-sm text-ink-muted">
        Не удалось загрузить раздел. Попробуйте обновить — данные не потеряны.
      </p>
      <button
        onClick={reset}
        className="rounded-lg border border-ink/15 px-4 py-2 text-sm font-medium text-ink transition hover:bg-bg-soft"
      >
        Обновить
      </button>
    </div>
  );
}
