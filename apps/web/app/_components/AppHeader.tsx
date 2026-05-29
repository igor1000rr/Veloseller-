"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Icons } from "./Icons";
import LogoutButton from "../dashboard/LogoutButton";
import WarehouseSelector from "./WarehouseSelector";
import type { WarehouseListItem } from "@/lib/warehouse-types";

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
  warehouses,
  selectedWarehouseId,
}: {
  email: string;
  variant: "dashboard" | "admin";
  unreadAlerts?: number;
  isAdmin?: boolean;
  plan?: string;
  warehouses?: WarehouseListItem[];
  selectedWarehouseId?: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => { setOpen(false); }, [pathname]);

  // Breakpoint navigation:
  // - <xl (1280px): бургер меню. На MacBook 13"/14" (1280-1440) navigation из 9 ссылок +
  //   правый блок (selector + PRO + email + ADMIN + logout) не помещаются, всё сжимается и
  //   имя склада обрезается до "T...". С xl+ показываем развёрнутую навигацию.
  const links = variant === "dashboard"
    ? [
        { href: "/dashboard",           label: "Обзор" },
        { href: "/dashboard/skus",      label: "SKU" },
        { href: "/dashboard/alerts",    label: "Отчёты", badge: unreadAlerts },
        { href: "/dashboard/dynamics",  label: "Динамика" },
        { href: "/dashboard/changelog", label: "Журнал" },
        { href: "/dashboard/radar",     label: "Radar", isNew: true },
        { href: "/connections",         label: "Склады" },
        { href: "/dashboard/settings",  label: "Настройки" },
        { href: "/billing",             label: "Тариф" },
      ]
    : [
        { href: "/admin",          label: "Обзор" },
        { href: "/admin/finance",  label: "Финансы" },
        { href: "/admin/radar",    label: "Radar" },
        { href: "/admin/health",   label: "Здоровье" },
        { href: "/admin/sellers",  label: "Селлеры" },
        { href: "/admin/activity", label: "Активность" },
        { href: "/admin/settings", label: "Настройки" },
      ];

  const planLabel = plan ? PLAN_LABEL[plan] ?? plan : null;
  const planClass = plan ? PLAN_COLORS[plan] ?? PLAN_COLORS.trial : "";

  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-paper/90 border-b border-line" style={{ backgroundColor: "rgba(255,255,255,0.9)" }}>
      <div className="w-full px-4 md:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-4 xl:gap-5 min-w-0">
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
          {/* Навигация: xl+ (≥1280px). Ниже — бургер чтобы всё не сжималось. */}
          <nav className="hidden xl:flex items-center gap-0.5 text-sm">
            {links.map((l: any) => {
              const active = pathname === l.href || (l.href !== "/dashboard" && l.href !== "/admin" && pathname?.startsWith(l.href));
              return (
                <Link
                  key={l.href}
                  href={l.href as any}
                  className={`relative px-2.5 py-1.5 rounded-md transition ${
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
                  {l.isNew && (
                    <span className="ml-1.5 inline-flex items-center justify-center px-1.5 h-[16px] text-[9px] font-mono font-semibold bg-lime-deep text-paper rounded uppercase tracking-wider">
                      new
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {variant === "dashboard" && warehouses && (
            <div className="hidden sm:block">
              <WarehouseSelector warehouses={warehouses} selectedId={selectedWarehouseId ?? null} />
            </div>
          )}

          {planLabel && variant === "dashboard" && (
            <Link
              href={"/billing" as any}
              title={`Текущий тариф: ${planLabel}`}
              className={`hidden xl:inline-flex items-center gap-1.5 px-2 py-1 rounded-md border ${planClass} hover:opacity-80 transition`}
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] font-semibold">{planLabel}</span>
            </Link>
          )}

          {/* Email — показываем только на 2xl+ (≥1536px). Для MacBook 13/14" нет места. */}
          <span className="hidden 2xl:inline font-mono text-xs text-ink-hush truncate max-w-[160px]">{email}</span>

          {isAdmin && variant === "dashboard" && (
            <Link
              href={"/admin" as any}
              className="hidden xl:inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-orange/30 bg-orange/10 text-orange hover:bg-orange/15 transition"
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] font-semibold">admin</span>
              <Icons.ArrowRight size={11} />
            </Link>
          )}
          {variant === "admin" && (
            <Link
              href={"/dashboard" as any}
              className="hidden xl:inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-line bg-paper text-ink-muted hover:text-ink hover:bg-bg-soft transition"
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.15em]">личный</span>
            </Link>
          )}

          {variant === "dashboard" && <LogoutButton />}

          {/* Бургер — на <xl (Ц1280) показвывается. */}
          <button
            onClick={() => setOpen(true)}
            className="xl:hidden inline-flex items-center justify-center size-9 rounded-lg border border-line bg-paper text-ink hover:bg-bg-soft transition"
            aria-label="Меню"
          >
            <Icons.Menu size={20} />
          </button>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 xl:hidden bg-paper flex flex-col slide-down"
          style={{ backgroundColor: "#ffffff" }}
        >
          <div className="flex items-center justify-between px-4 md:px-8 py-3 border-b border-line bg-paper" style={{ backgroundColor: "#ffffff" }}>
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
          <nav className="flex-1 flex flex-col px-4 md:px-8 py-6 gap-1 overflow-y-auto bg-paper" style={{ backgroundColor: "#ffffff" }}>
            {variant === "dashboard" && warehouses && warehouses.length > 0 && (
              <div className="mb-3 px-3 py-2.5 rounded-lg border border-line bg-bg-soft">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hush font-semibold mb-2">
                  Выбранный склад
                </div>
                <WarehouseSelector warehouses={warehouses} selectedId={selectedWarehouseId ?? null} forceVisible />
              </div>
            )}
            {planLabel && variant === "dashboard" && (
              <Link href={"/billing" as any} onClick={() => setOpen(false)}
                className={`flex items-center justify-between py-3 px-3 mb-2 rounded-lg border ${planClass}`}>
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] font-semibold">
                  Тариф: {planLabel}
                </span>
                <Icons.ArrowRight size={14} />
              </Link>
            )}
            {links.map((l: any) => (
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
                  {l.isNew && (
                    <span className="inline-flex items-center justify-center px-2 h-[18px] text-[10px] font-mono font-semibold bg-lime-deep text-paper rounded uppercase tracking-wider">
                      new
                    </span>
                  )}
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
          <div className="px-4 md:px-8 py-5 border-t border-line space-y-2 bg-paper" style={{ backgroundColor: "#ffffff" }}>
            <div className="font-mono text-xs text-ink-hush break-all">{email}</div>
            {variant === "dashboard" && <LogoutButton />}
          </div>
        </div>
      )}
    </header>
  );
}
