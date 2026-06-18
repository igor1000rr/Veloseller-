import Link from "next/link";

// Лёгкая шапка/футер для лендинговых подстраниц (/partner, /apps).
// Свои, а не _landing/Header: без auth-проверки и i18n-словаря — страницы
// статичные и русскоязычные (как /terms, /privacy).

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="size-1 rounded-full bg-lime-deep" />
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">
        {children}
      </span>
    </span>
  );
}

export function MarketingHeader() {
  return (
    <header
      className="sticky top-0 z-30 backdrop-blur-md bg-paper/95 border-b border-line"
      style={{ backgroundColor: "rgba(255,255,255,0.95)" }}
    >
      <div className="max-w-6xl mx-auto px-6 py-3 md:py-4 flex items-center justify-between gap-4">
        <Link href={"/" as any} className="font-display text-lg font-medium tracking-tight shrink-0">
          Velo<span className="text-lime-deep">seller</span>
        </Link>
        <nav className="flex items-center gap-4 sm:gap-6 text-sm">
          <Link href={"/apps" as any} className="text-ink-soft hover:text-lime-deep transition">
            Приложения
          </Link>
          <Link href={"/partner" as any} className="text-ink-soft hover:text-lime-deep transition">
            Партнёрам
          </Link>
          <Link
            href={"/register" as any}
            className="rounded-lg bg-ink text-paper px-4 py-2 font-semibold hover:bg-ink-soft transition"
          >
            Начать
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-line bg-bg-soft">
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
        <span className="font-display text-lg tracking-tight font-medium">Veloseller</span>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-soft">
          <Link href={"/" as any} className="hover:text-lime-deep transition">Главная</Link>
          <Link href={"/apps" as any} className="hover:text-lime-deep transition">Приложения</Link>
          <Link href={"/partner" as any} className="hover:text-lime-deep transition">Партнёрам</Link>
          <Link href={"/privacy" as any} className="hover:text-lime-deep transition">Конфиденциальность</Link>
          <Link href={"/terms" as any} className="hover:text-lime-deep transition">Условия</Link>
        </nav>
        <div className="font-mono text-xs text-ink-hush w-full md:w-auto">
          © {new Date().getFullYear()} Veloseller
        </div>
      </div>
    </footer>
  );
}
