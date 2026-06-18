/** Футер лендинга. Перенос из page.tsx 1:1; типы складов — по локали из data. */
import { Icons } from "../_components/Icons";
import { t } from "@/lib/i18n";
import { FooterCol } from "./ui";
import { footerWarehouseTypes, isEn } from "./data";
import { APP_PROMO_ENABLED } from "@/lib/features";

export default function LandingFooter({ isAuthed }: { isAuthed: boolean }) {
  return (
    <footer className="border-t border-line bg-bg-soft">
      <div className="max-w-[1600px] mx-auto w-full px-4 md:px-8 lg:px-12 py-12 md:py-16">
        <div className="grid grid-cols-2 md:grid-cols-12 gap-8 md:gap-10">
          <div className="col-span-2 md:col-span-4">
            <div className="flex items-center gap-2.5">
              <Icons.Logo />
              <span className="font-display text-xl tracking-tight font-medium">Veloseller</span>
            </div>
            <p className="mt-5 text-sm text-ink-muted max-w-xs leading-relaxed">
              {t("landing.ft.desc")}
            </p>
          </div>
          <FooterCol title={t("landing.ft.product")} items={[
            ["#features", t("landing.nav.features")],
            ["#how", t("landing.nav.how")],
            ["#pricing", t("landing.nav.pricing")],
            ["/news", t("landing.nav.news")],
            ...(APP_PROMO_ENABLED ? [["/apps", isEn ? "Mobile app" : "Приложение"]] : []),
            ["/partner", isEn ? "Partners" : "Партнёрам"],
            ["#faq", "FAQ"],
          ]} />
          <div className="col-span-1 md:col-span-2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">{t("landing.ft.types")}</div>
            <ul className="mt-4 space-y-2.5 text-sm">
              {footerWarehouseTypes.map((w) => (
                <li key={w} className="text-ink-soft">{w}</li>
              ))}
            </ul>
          </div>
          <FooterCol title={t("landing.ft.account")} items={
            isAuthed
              ? [["/dashboard", t("landing.ft.dashboard")], ["/billing", t("landing.ft.plan")], ["/account", t("landing.ft.profile")], ["#", t("landing.ft.support")]]
              : [["/login", t("landing.login")], ["/register", t("landing.ft.register")], ["#", t("landing.ft.docs")], ["#", t("landing.ft.support")]]
          } />
          <FooterCol title={t("landing.ft.community")} items={[
            ["#", "Telegram"],
            ["mailto:info@proaim.ru", "info@proaim.ru"],
            ["#", "GitHub"],
          ]} />
        </div>
        <div className="mt-10 md:mt-12 pt-6 md:pt-8 border-t border-line flex flex-wrap items-center justify-between gap-4">
          <div className="font-mono text-xs text-ink-hush">
            © {new Date().getFullYear()} Veloseller — {t("landing.ft.copyright")}
          </div>
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-lime-deep animate-pulse" />
            <span className="font-mono text-xs text-ink-hush">{t("landing.ft.allSystems")}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
