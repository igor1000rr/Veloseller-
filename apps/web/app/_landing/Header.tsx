/**
 * Хедер лендинга. Перенос из page.tsx 1:1, строки через t().
 * КРИТИКА из скрина: bg-bg/85 + backdrop-blur-md — на Telegram WebView blur
 * может не работать, и полупрозрачный bg-bg/85 даёт эффект просвечивания.
 * Поэтому bg-paper/95 (белый 95%) + inline-style fallback для надёжности.
 */
import Link from "next/link";
import { Icons } from "../_components/Icons";
import MobileMenu from "../_components/MobileMenu";
import { t } from "@/lib/i18n";
import { isEn } from "./data";

export default function LandingHeader({ isAuthed }: { isAuthed: boolean }) {
  return (
    <header
      className="sticky top-0 z-30 backdrop-blur-md bg-paper/95 border-b border-line"
      style={{ backgroundColor: "rgba(255,255,255,0.95)" }}
    >
      <div className="w-full px-4 md:px-8 lg:px-12 py-3 md:py-4 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <Icons.Logo />
          <span className="font-display text-lg font-medium tracking-tight">
            Velo<span className="text-lime-deep">seller</span>
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-7">
          <a href="#features" className="text-sm text-ink-soft hover:text-lime-deep transition">{t("landing.nav.features")}</a>
          <a href="#how" className="text-sm text-ink-soft hover:text-lime-deep transition">{t("landing.nav.how")}</a>
          <a href="#integrations" className="text-sm text-ink-soft hover:text-lime-deep transition">{t("landing.nav.integrations")}</a>
          <a href="#pricing" className="text-sm text-ink-soft hover:text-lime-deep transition">{t("landing.nav.pricing")}</a>
          <Link href={"/news" as any} className="text-sm text-ink-soft hover:text-lime-deep transition">{t("landing.nav.news")}</Link>
          <Link href={"/apps" as any} className="text-sm text-ink-soft hover:text-lime-deep transition">{isEn ? "App" : "Приложение"}</Link>
          <Link href={"/partner" as any} className="text-sm font-medium text-lime-deep hover:text-lime transition">{isEn ? "Partners" : "Партнёрам"}</Link>
          <a href="#faq" className="text-sm text-ink-soft hover:text-lime-deep transition">FAQ</a>
        </nav>
        <div className="flex items-center gap-2 md:gap-3">
          {isAuthed ? (
            <Link
              href={"/dashboard" as any}
              className="hidden md:inline-flex items-center gap-2 rounded-lg bg-ink text-paper px-4 py-2 text-sm font-semibold hover:bg-ink-soft transition"
            >
              {t("landing.toDashboard")} <Icons.ArrowRight size={12} />
            </Link>
          ) : (
            <>
              <Link href={"/login" as any} className="hidden md:inline-block text-sm text-ink-soft hover:text-ink transition px-2 py-1">
                {t("landing.login")}
              </Link>
              <Link
                href={"/register" as any}
                className="hidden md:inline-flex rounded-lg bg-ink text-paper px-4 py-2 text-sm font-semibold hover:bg-ink-soft transition"
              >
                {t("landing.start")}
              </Link>
            </>
          )}
          <MobileMenu isAuthed={isAuthed} />
        </div>
      </div>
    </header>
  );
}
