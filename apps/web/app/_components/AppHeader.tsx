"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Icons } from "./Icons";
import { ContactLinks } from "./ContactLinks";
import LogoutButton from "../dashboard/LogoutButton";
import WarehouseSelector from "./WarehouseSelector";
import type { WarehouseListItem } from "@/lib/warehouse-types";
import { t } from "@/lib/i18n";

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
  //
  // 01.06.2026 (Александр): убрал счётчик SKU с пункта "Отчёты". Раньше показывал
  // unreadAlerts из таблицы alerts старого формата (3272 у Александра) — это сбивало
  // с толку, потому что "Отчёты" теперь = история отправленных файлов (report_history),
  // к необработанным алертам отношения не имеет. unreadAlerts проп оставлен в сигнатуре
  // — может пригодиться для других пунктов меню позже.
  const links = variant === "dashboard"
    ? [
        { href: "/dashboard",           label: t("nav.overview") },
        { href: "/dashboard/skus",      label: t("nav.skus") },
        { href: "/dashboard/alerts",    label: t("nav.reports") },
        { href: "/dashboard/dynamics",  label: t("nav.dynamics") },
        { href: "/dashboard/changelog", label: t("nav.changelog") },
        { href: "/dashboard/radar",     label: t("nav.radar"), isNew: true },
        { href: "/connections",         label: t("nav.warehouses") },
        { href: "/dashboard/settings",  label: t("nav.settings") },
        { href: "/billing",             label: t("nav.billing") },
      ]
    : [
        { href: "/admin",          label: t("nav.overview") },
        { href: "/admin/finance",  label: t("nav.admin.finance") },
        { href: "/admin/radar",    label: t("nav.radar") },
        { href: "/admin/health",   label: t("nav.admin.health") },
        { href: "/admin/sellers",  label: t("nav.admin.sellers") },
        { href: "/admin/activity", label: t("nav.admin.activity") },
        { href: "/admin/settings", label: t("nav.settings") },
        { href: "/admin/email-debug", label: t("nav.admin.emailDebug") },
      ];

  const planLabel = plan ? PLAN_LABEL[plan] ?? plan : null;
  const planClass = plan ? PLAN_COLORS[plan] ?? PLAN_COLORS.trial : "";

  // Мобильное меню рендерится через createPortal в document.body.
  // ПРИЧИНА (скрин Александра 02.06.2026, «урезанное меню и на мобиле и на
  // десктопе»): шапка имеет backdrop-blur-md, а backdrop-filter на предке по
  // CSS-спеке делает его containing block для position:fixed потомков —
  // оверлей fixed inset-0 растягивался не на viewport, а на высоту шапки,
  // и список пунктов обрезался. Через portal fixed считается от viewport.
  // open ставится только кликом → портал вызывается только на клиенте (SSR-safe).
  const mobileMenu = open ? (
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
        <button onClick={() => setOpen(false)} className="inline-flex items-center justify-center size-9 rounded-lg border border-line bg-paper" aria-label={t("common.close")}>
          <Icons.Close size={20} />
        </button>
      </div>
      <nav className="flex-1 flex flex-col px-4 md:px-8 py-6 gap-1 overflow-y-auto bg-paper" style={{ backgroundColor: "#ffffff" }}>
        {variant === "dashboard" && warehouses && warehouses.length > 0 && (
          <div className="mb-3 px-3 py-2.5 rounded-lg border border-line bg-bg-soft">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hush font-semibold mb-2">
              {t("nav.selectedWarehouse")}
            </div>
            <WarehouseSelector warehouses={warehouses} selectedId={selectedWarehouseId ?? null} forceVisible />
          </div>
        )}
        {planLabel && variant === "dashboard" && (
          <Link href={"/billing"} onClick={() => setOpen(false)}
            className={`flex items-center justify-between py-3 px-3 mb-2 rounded-lg border ${planClass}`}>
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] font-semibold">
              {t("nav.planShort", { plan: planLabel ?? "" })}
            </span>
            <Icons.ArrowRight size={14} />
          </Link>
        )}
        {links.map((l: any) => (
          <Link
            key={l.href}
            href={l.href}
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
          <Link href={"/admin"} onClick={() => setOpen(false)}
            className="flex items-center justify-between py-4 border-b border-line text-xl font-display text-orange hover:opacity-80 transition">
            <span className="flex items-center gap-3">Admin
              <span className="font-mono text-[10px] text-orange uppercase tracking-[0.18em] font-semibold border border-orange/30 bg-orange/10 px-1.5 py-0.5 rounded">admin</span>
            </span>
            <Icons.ArrowRight size={16} />
          </Link>
        )}
        {variant === "admin" && (
          <Link href={"/dashboard"} onClick={() => setOpen(false)}
            className="flex items-center justify-between py-4 border-b border-line text-xl font-display text-ink hover:text-lime-deep transition">
            <span>{t("nav.toDashboard")}</span>
            <Icons.ArrowRight size={16} />
          </Link>
        )}
      </nav>
      <div className="px-4 md:px-8 py-5 border-t border-line space-y-2 bg-paper" style={{ backgroundColor: "#ffffff" }}>
        <ContactLinks className="flex mb-1" />
        <div className="font-mono text-xs text-ink-hush break-all">{email}</div>
        {variant === "dashboard" && <LogoutButton />}
      </div>
    </div>
  ) : null;

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
                  href={l.href}
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
          <ContactLinks className="hidden sm:inline-flex" />
          {variant === "dashboard" && warehouses && (
            <div className="hidden sm:block">
              <WarehouseSelector warehouses={warehouses} selectedId={selectedWarehouseId ?? null} />
            </div>
          )}

          {planLabel && variant === "dashboard" && (
            <Link
              href={"/billing"}
              title={t("nav.currentPlan", { plan: planLabel ?? "" })}
              className={`hidden xl:inline-flex items-center gap-1.5 px-2 py-1 rounded-md border ${planClass} hover:opacity-80 transition`}
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] font-semibold">{planLabel}</span>
            </Link>
          )}

          {/* Email — показываем только на 2xl+ (≥1536px). Для MacBook 13/14" нет места. */}
          <span className="hidden 2xl:inline font-mono text-xs text-ink-hush truncate max-w-[160px]">{email}</span>

          {isAdmin && variant === "dashboard" && (
            <Link
              href={"/admin"}
              className="hidden xl:inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-orange/30 bg-orange/10 text-orange hover:bg-orange/15 transition"
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] font-semibold">admin</span>
              <Icons.ArrowRight size={11} />
            </Link>
          )}
          {variant === "admin" && (
            <Link
              href={"/dashboard"}
              className="hidden xl:inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-line bg-paper text-ink-muted hover:text-ink hover:bg-bg-soft transition"
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.15em]">{t("nav.toPersonal")}</span>
            </Link>
          )}

          {variant === "dashboard" && <LogoutButton />}

          {/* Бургер — на <xl (Ц1280) показвывается. */}
          <button
            onClick={() => setOpen(true)}
            className="xl:hidden inline-flex items-center justify-center size-9 rounded-lg border border-line bg-paper text-ink hover:bg-bg-soft transition"
            aria-label={t("common.menu")}
          >
            <Icons.Menu size={20} />
          </button>
        </div>
      </div>

      {mobileMenu && createPortal(mobileMenu, document.body)}
    </header>
  );
}
