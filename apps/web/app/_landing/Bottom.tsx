/** Цены, FAQ и финальный CTA. Перенос из page.tsx 1:1; цены — из lib/plans. */
import Link from "next/link";
import { Icons } from "../_components/Icons";
import FaqAccordion from "../FaqAccordion";
import { t } from "@/lib/i18n";
import { Eyebrow, PricingCard } from "./ui";
import { landingPlans } from "./data";

export default function LandingBottom({ isAuthed }: { isAuthed: boolean }) {
  return (
    <>
      {/* ===== PRICING ===== */}
      <section id="pricing" className="relative w-full px-4 md:px-8 lg:px-12 py-8 md:py-12 border-t border-line bg-bg-soft">
        <div className="max-w-[1600px] mx-auto">
          <div className="text-center mb-10 md:mb-12">
            <Eyebrow center>{t("landing.pr.eyebrow")}</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-5xl tracking-tight font-medium">
              {t("landing.pr.h2")}
            </h2>
            <p className="mt-3 text-ink-muted text-sm md:text-base">{t("landing.pr.sub")}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4 md:gap-6 max-w-6xl mx-auto">
            {landingPlans.map((p) => <PricingCard key={p.name} {...p} isAuthed={isAuthed} />)}
          </div>
          <p className="mt-8 md:mt-10 text-center font-mono text-xs text-ink-hush flex items-center justify-center flex-wrap gap-x-2 gap-y-1">
            <span>{t("billing.includes")}</span>
            <span>TVelo</span><Icons.Dot size={3} /> <span>{t("billing.feat.coverage")}</span><Icons.Dot size={3} /> <span>{t("billing.feat.lost")}</span><Icons.Dot size={3} /> <span>{t("billing.feat.purchase")}</span><Icons.Dot size={3} /> <span>Email + Telegram</span>
          </p>
          <p className="mt-3 text-center font-mono text-[11px] text-ink-hush">
            {t("billing.integrators")} <a href="mailto:info@proaim.ru" className="text-lime-deep hover:underline">info@proaim.ru</a>
          </p>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section id="faq" className="relative w-full px-4 md:px-8 lg:px-12 py-8 md:py-12 border-t border-line">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-10 md:mb-14">
            <Eyebrow center>FAQ</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-5xl tracking-tight font-medium">
              {t("landing.faq.h2")}
            </h2>
          </div>
          <FaqAccordion />
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="relative w-full px-4 md:px-8 lg:px-12 py-8 md:py-12">
        <div className="max-w-[1600px] mx-auto">
          <div className="relative overflow-hidden rounded-3xl border-2 border-lime-deep/30 bg-gradient-to-br from-lime-soft via-paper to-paper p-6 sm:p-8 md:p-16 lg:p-20">
            <div className="absolute -right-20 -top-20 size-80 rounded-full bg-lime/30 blur-3xl" />
            <div className="absolute -left-20 -bottom-20 size-60 rounded-full bg-azure/20 blur-3xl" />
            <div className="relative z-10 max-w-3xl">
              <h2 className="font-display text-2xl sm:text-3xl md:text-5xl lg:text-6xl tracking-tight leading-[1.05] font-medium break-words">
                {t("landing.cta.h2a")} <span className="text-lime-deep italic">{t("landing.cta.h2b")}</span>
              </h2>
              <p className="mt-4 md:mt-5 text-ink-muted text-base md:text-lg max-w-2xl leading-relaxed">
                {t("landing.cta.sub")}
              </p>
              <div className="mt-7 md:mt-8 flex flex-wrap gap-3 md:gap-4">
                <Link
                  href={(isAuthed ? "/dashboard" : "/register")}
                  className="inline-flex items-center gap-2 rounded-lg bg-ink text-paper px-6 md:px-7 py-3.5 md:py-4 text-base font-semibold hover:bg-ink-soft transition shadow-[0_10px_30px_-10px_rgba(10,10,8,0.4)]"
                >
                  {isAuthed ? t("landing.cta.open") : t("landing.pr.startFree")} <Icons.ArrowRight />
                </Link>
                <a href="#pricing" className="inline-flex items-center px-6 md:px-7 py-3.5 md:py-4 text-ink-muted hover:text-lime-deep transition">
                  {t("landing.cta.seePricing")}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
