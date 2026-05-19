"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Icons } from "./Icons";
import LogoutButton from "../dashboard/LogoutButton";

const PLAN_LABEL: Record<string, string> = {
  trial: "Trial",
  starter: "Starter",
  growth: "Growth",
  pro: "Pro",
};

const PLAN_COLORS: Record<string, string> = {
  trial: "border-line bg-bg-soft text-ink-muted",
  starter: "border-lime-deep/40 bg-lime-soft text-lime-deep",
  growth: "border-azure/40 bg-azure/10 text-azure",
  pro: "border-orange/40 bg-orange/10 text-orange",
};

export default function AppHeader({
  email,
  variant,
  unreadAlerts,
  isAdmin,
  plan,
}: {
  email: string;
  variant: "dashboard" | "admin";
  unreadAlerts?: number;
  isAdmin?: boolean;
  plan?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => { setOpen(false); }, [pathname]);

  // Тихий refresh данных при возврате на вкладку — чтобы кеш точно не висел
  useEffect(() => {
    const onFocus = () => router.refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [router]);

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
        { href: "/admin/finance",  label: "Финансы" },
        { href: "/admin/health",   label: "Здоровье" },
        { href: "/admin/sellers",  label: "Селлеры" },
        { href: "/admin/activity", label: "Активность" },
        { href: "/admin/settings", label: "Настройки" },
      ];

  const planLabel = plan ? PLAN_LABEL[plan] ?? plan : null;
  const planClass = plan ? PLAN_COLORS[plan] ?? PLAN_COLORS.trial : "";

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
          {/* Badge с текущим планом — заметный, кликабельный */}
          {planLabel && variant === "dashboard" && (
            <Link
              href={"/billing" as any}
              title={`Текущий тариф: ${planLabel}`}
              className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border ${planClass} hover:opacity-80 transition`}
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] font-semibold">{planLabel}</span>
            </Link>
          )}

          <span className="hidden md:inline font-mono text-xs text-ink-hush truncate max-w-[180px]">{email}</span>

          {isAdmin && variant === "dashboard" && (
            <Link
              href={"/admin" as any}
              className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-orange/30 bg-orange/10 text-orange hover:bg-orange/15 transition"
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] font-semibold">admin</span>
              <Icons.ArrowRight size={11} />
            </Link>
          )}
          {variant === "admin" && (
            <Link
              href={"/dashboard" as any}
              className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-line bg-paper text-ink-muted hover:text-ink hover:bg-bg-soft transition"
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.18em]">личный</span>
            </Link>
          )}

          {variant === "dashboard" && <LogoutButton />}

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
              {variant === "admin" && (
                <span className="font-mono text-[9px] text-orange uppercase tracking-[0.18em] font-semibold border border-orange/30 bg-orange/10 px-1.5 py-0.5 rounded">admin</span>
              )}
            </Link>
            <button onClick={() => setOpen(false)} className="inline-flex items-center justify-center size-9 rounded-lg border border-line bg-paper" aria-label="Закрыть">
              <Icons.Close size={20} />
            </button>
          </div>
          <nav className="flex-1 flex flex-col px-4 md:px-8 py-6 gap-1 overflow-y-auto">
            {planLabel && variant === "dashboard" && (
              <Link href={"/billing" as any} onClick={() => setOpen(false)}
                className={`flex items-center justify-between py-3 px-3 mb-2 rounded-lg border ${planClass}`}>
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] font-semibold">
                  Тариф: {planLabel}
                </span>
                <Icons.ArrowRight size={14} />
              </Link>
            )}
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
            {isAdmin && variant === "dashboard" && (
              <Link href={"/admin" as any} onClick={() => setOpen(false)}
                className="flex items-center justify-between py-4 border-b border-line text-xl font-display text-orange hover:opacity-80 transition">
                <span className="flex items-center gap-3">Admin
                  <span className="font-mono text-[10px] text-orange uppercase tracking-[0.18em] font-semibold border border-orange/30 bg-orange/10 px-1.5 py-0.5 rounded">admin</span>
                </span>
                <Icons.ArrowRight size={16} />
              </Link>
            )}
            {variant === "admin" && (
              <Link href={"/dashboard" as any} onClick={() => setOpen(false)}
                className="flex items-center justify-between py-4 border-b border-line text-xl font-display text-ink hover:text-lime-deep transition">
                <span>В личный кабинет</span>
                <Icons.ArrowRight size={16} />
              </Link>
            )}
          </nav>
          <div className="px-4 md:px-8 py-5 border-t border-line space-y-2">
            <div className="font-mono text-xs text-ink-hush">{email}</div>
            {variant === "dashboard" && <LogoutButton />}
          </div>
        </div>
      )}
    </header>
  );
}
