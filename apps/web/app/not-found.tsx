import Link from "next/link";

/** 404 — показывается на любой несуществующий маршрут вместо пустой страницы. */
export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <p className="font-mono text-sm uppercase tracking-wider text-ink-hush">404</p>
      <h1 className="font-display text-2xl font-medium text-ink">Страница не найдена</h1>
      <p className="max-w-md text-sm text-ink-muted">
        Похоже, такой страницы нет или она была перемещена.
      </p>
      <Link
        href="/"
        className="rounded-lg border border-ink/15 px-4 py-2 text-sm text-ink transition hover:bg-bg-soft"
      >
        На главную
      </Link>
    </div>
  );
}
