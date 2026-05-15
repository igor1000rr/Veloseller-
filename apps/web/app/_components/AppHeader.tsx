"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Icons } from "./Icons";
import LogoutButton from "../dashboard/LogoutButton";

export default function AppHeader({
  email,
  variant,
  unreadAlerts,
}: {
  email: string;
  variant: "dashboard" | "admin";
  unreadAlerts?: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => { setOpen(false); }, [pathname]);

  const links = variant === "dashboard"
    ? [
        { href: "/dashboard",           label: "Обзор" },
        { href: "/dashboard/skus",      label: "SKU" },
        { href: "/dashboard/alerts",    label: "Уведомления", badge: unreadAlerts },
        { href: "/dashboard/dynamics",  label: "Динамика" },
        { href: "/dashboard/changelog", label: "Журнал" },
        { href: "/connections",         label: "Источники" },
        { href: "/dashboard/settings",  label: "Настройки" },
        { href: "/billing",             label: "Тариф" },
      ]
    : [
        { href: "/admin",          label: "Обзор" },
        { href: "/admin/sellers",  label: "Селлеры" },
        { href: "/admin/activity", label: "Активность" },
      ];

  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-paper/85 border-b border-line">
      <div className="w-full px-4 md:px-8 lg:px-12 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6 min-w-0">
          <Link href={variant === "admin" ? "/admin" : "/dashboard"} className="flex items-center gap-2.5 shrink-0">
            <Icons.Logo size={26} />
            <span className="font-display text-base font-medium tracking-tight">
              Velo<span className="text-lime-deep">seller</span>
            </span>
            {variant === "admin" && (
              <span className="font-mono text-[9.5px] text-orange uppercase tracking-[0.18em] font-semibold border border-orange/30 bg-orange/10 px-1.5 py-0.5 rounded">
                admin
              </span>
            )}
          </Link>
          <nav className="hidden lg:flex items-center gap-1 text-sm">
            {links.map((l) => {
              const active = pathname === l.href || (l.href !== "/dashboard" && l.href !== "/admin" && pathname?.startsWith(l.href));
              return (
                <Link
                  key={l.href}
                  href={l.href as any}
                  className={`relative px-3 py-1.5 rounded-md transition ${
                    active
                      ? "text-ink bg-bg-soft"
                      : "text-ink-muted hover:text-ink hover:bg-bg-soft"
                  }`}
                >
                  {l.label}
                  {l.badge && l.badge > 0 ? (
                    <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-mono font-semibold bg-rose text-paper rounded">
                      {l.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden md:inline font-mono text-xs text-ink-hush truncate max-w-[180px]">{email}</span>
          {variant === "admin" ? (
            <Link href={"/dashboard" as any} className="hidden md:inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-lime-deep transition">
              <Icons.ArrowRight size={12} /> Личный
            </Link>
          ) : (
            <LogoutButton />
          )}
          <button
            onClick={() => setOpen(true)}
            className="lg:hidden inline-flex items-center justify-center size-9 rounded-lg border border-line bg-paper text-ink hover:bg-bg-soft transition"
            aria-label="Меню"
          >
            <Icons.Menu size={20} />
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden bg-bg flex flex-col slide-down">
          <div className="flex items-center justify-between px-4 md:px-8 py-3 border-b border-line">
            <Link href={variant === "admin" ? "/admin" : "/dashboard"} onClick={() => setOpen(false)} className="flex items-center gap-2.5">
              <Icons.Logo size={26} />
              <span className="font-display text-base font-medium tracking-tight">Veloseller</span>
            </Link>
            <button onClick={() => setOpen(false)} className="inline-flex items-center justify-center size-9 rounded-lg border border-line bg-paper" aria-label="Закрыть">
              <Icons.Close size={20} />
            </button>
          </div>
          <nav className="flex-1 flex flex-col px-4 md:px-8 py-6 gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href as any}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between py-4 border-b border-line text-xl font-display text-ink hover:text-lime-deep transition"
              >
                <span className="flex items-center gap-3">
                  {l.label}
                  {l.badge && l.badge > 0 ? (
                    <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 text-[10px] font-mono font-semibold bg-rose text-paper rounded">{l.badge}</span>
                  ) : null}
                </span>
                <Icons.ArrowRight size={16} />
              </Link>
            ))}
          </nav>
          <div className="px-4 md:px-8 py-5 border-t border-line space-y-2">
            <div className="font-mono text-xs text-ink-hush">{email}</div>
            {variant === "admin" && (
              <Link href={"/dashboard" as any} onClick={() => setOpen(false)} className="flex items-center justify-center w-full rounded-lg border border-line bg-paper text-ink px-5 py-3 font-medium">
                В личный кабинет
              </Link>
            )}
            {variant === "dashboard" && <LogoutButton />}
          </div>
        </div>
      )}
    </header>
  );
}
