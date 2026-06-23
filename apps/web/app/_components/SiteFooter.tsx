// Переиспользуемый footer для /news и /news/[slug]. Главная держит свой inline.

import Link from "next/link";
import { Icons } from "./Icons";
import { t } from "@/lib/i18n";

export default function SiteFooter() {
  return (
    <footer className="border-t border-line bg-bg-soft">
      <div className="max-w-[1600px] mx-auto w-full px-4 md:px-8 lg:px-12 py-12 md:py-16">
        <div className="grid grid-cols-2 md:grid-cols-12 gap-8 md:gap-10">
          <div className="col-span-2 md:col-span-4">
            <Link href={"/" as never} className="flex items-center gap-2.5">
              <Icons.Logo />
              <span className="font-display text-xl tracking-tight font-medium">Veloseller</span>
            </Link>
            <p className="mt-5 text-sm text-ink-muted max-w-xs leading-relaxed">
              {t("site.footer.tagline")}
            </p>
          </div>

          <div className="col-span-1 md:col-span-2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">{t("site.footer.product")}</div>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link href={"/#features" as never} className="text-ink-soft hover:text-lime-deep transition">
                  {t("site.nav.features")}
                </Link>
              </li>
              <li>
                <Link href={"/#how" as never} className="text-ink-soft hover:text-lime-deep transition">
                  {t("site.nav.how")}
                </Link>
              </li>
              <li>
                <Link href={"/#pricing" as never} className="text-ink-soft hover:text-lime-deep transition">
                  {t("site.nav.pricing")}
                </Link>
              </li>
              <li>
                <Link href={"/#faq" as never} className="text-ink-soft hover:text-lime-deep transition">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          <div className="col-span-1 md:col-span-2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">{t("site.footer.resources")}</div>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link href={"/news" as never} className="text-ink-soft hover:text-lime-deep transition">
                  {t("site.footer.newsGuides")}
                </Link>
              </li>
              <li>
                <Link href={"/login" as never} className="text-ink-soft hover:text-lime-deep transition">
                  {t("site.cta.login")}
                </Link>
              </li>
              <li>
                <Link href={"/register" as never} className="text-ink-soft hover:text-lime-deep transition">
                  {t("site.footer.register")}
                </Link>
              </li>
            </ul>
          </div>

          <div className="col-span-1 md:col-span-2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">{t("site.footer.contacts")}</div>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <a href="mailto:info@veloseller.ru" className="text-ink-soft hover:text-lime-deep transition">
                  info@veloseller.ru
                </a>
              </li>
              <li>
                <Link href={"/privacy" as never} className="text-ink-soft hover:text-lime-deep transition">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href={"/terms" as never} className="text-ink-soft hover:text-lime-deep transition">
                  Terms
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 md:mt-12 pt-6 md:pt-8 border-t border-line flex flex-wrap items-center justify-between gap-4">
          <div className="font-mono text-xs text-ink-hush">
            {t("site.footer.copyright", { year: new Date().getFullYear() })}
          </div>
        </div>
      </div>
    </footer>
  );
}
