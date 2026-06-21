/** Hero лендинга. Перенос из page.tsx 1:1, строки через t(). */
import Link from "next/link";
import { Icons } from "../_components/Icons";
import HeroVeloDemo from "../HeroVeloDemo";
import { t } from "@/lib/i18n";

export default function LandingHero({ isAuthed }: { isAuthed: boolean }) {
  return (
    <section className="relative w-full px-4 md:px-8 lg:px-12 pt-12 pb-8 md:pt-20 md:pb-12">
      <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-center max-w-[1600px] mx-auto">
        <div className="lg:col-span-6 reveal">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-lime-deep/30 bg-lime-soft">
            <span className="size-1.5 rounded-full bg-lime-deep animate-pulse" />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime-deep font-semibold">
              Inventory intelligence v1.0
            </span>
          </div>

          {/* Mobile: text-4xl (36px) вместо text-[44px] — на 320px экране 44px впритык
              и могло перенестись неловко. break-words на случай очень узких экранов. */}
          <h1 className="mt-6 font-display text-4xl sm:text-5xl md:text-6xl xl:text-7xl leading-[0.95] tracking-tight font-medium break-words">
            {t("landing.hero.h1a")}{" "}
            <span className="text-lime-deep italic font-display">{t("landing.hero.h1b")}</span>
          </h1>

          <p className="mt-6 text-base md:text-lg text-ink-muted max-w-xl leading-relaxed">
            {t("landing.hero.lead1")}{" "}
            <span className="text-ink font-medium">{t("landing.hero.lead2")}</span>{t("landing.hero.lead3")}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href={(isAuthed ? "/dashboard" : "/register")}
              className="group inline-flex items-center gap-2 rounded-lg bg-ink text-paper px-5 md:px-6 py-3.5 font-semibold hover:bg-ink-soft transition shadow-[0_10px_30px_-10px_rgba(10,10,8,0.4)]"
            >
              {isAuthed ? t("landing.toDashboard") : t("landing.connectWarehouse")}
              {!isAuthed && <span className="font-mono text-xs opacity-60">{t("landing.fiveMin")}</span>}
              <Icons.ArrowRight />
            </Link>
            <a href="#how" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-lime-deep transition px-2">
              {t("landing.howItWorksLink")} <Icons.ArrowRight size={12} />
            </a>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-hush font-mono">
            <span className="flex items-center gap-1.5 text-lime-deep"><Icons.Check size={12} /> <span className="text-ink-hush">{t("landing.free30")}</span></span>
            <span className="flex items-center gap-1.5 text-lime-deep"><Icons.Check size={12} /> <span className="text-ink-hush">{t("landing.noCard")}</span></span>
            <span className="flex items-center gap-1.5 text-lime-deep"><Icons.Check size={12} /> <span className="text-ink-hush">{t("landing.readOnly")}</span></span>
          </div>
        </div>

        <div className="lg:col-span-6 reveal" style={{ animationDelay: "120ms" }}>
          <HeroVeloDemo />
        </div>
      </div>
    </section>
  );
}
