/** Bento-сетка «Возможности». Перенос из page.tsx 1:1, строки через t(). */
import { Icons } from "../_components/Icons";
import { t } from "@/lib/i18n";
import { Eyebrow, BentoCard } from "./ui";

export default function LandingFeatures() {
  return (
    <section id="features" className="relative w-full px-4 md:px-8 lg:px-12 py-8 md:py-12 border-t border-line bg-bg-soft">
      <div className="max-w-[1600px] mx-auto">
        <div className="text-center mb-10 md:mb-14">
          <Eyebrow center>{t("landing.nav.features")}</Eyebrow>
          <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-5xl tracking-tight font-medium">
            {t("landing.feat.h2")}
          </h2>
          <p className="mt-4 text-ink-muted max-w-2xl mx-auto text-sm md:text-base">
            {t("landing.feat.sub")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 auto-rows-[minmax(180px,_auto)]">
          <div className="md:col-span-2 md:row-span-2 rounded-2xl border border-line bg-paper p-5 sm:p-6 md:p-8 hover:border-lime-deep/40 transition shadow-sm relative overflow-hidden">
            <div className="absolute -top-10 -right-10 size-48 rounded-full bg-lime-soft blur-2xl" />
            <div className="relative">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-lg bg-lime text-ink"><Icons.Speed /></div>
                <span className="font-mono text-[10px] text-ink-hush">{t("landing.feat.main.idx")}</span>
              </div>
              <h3 className="mt-5 md:mt-6 font-display text-xl sm:text-2xl md:text-4xl tracking-tight font-medium">{t("landing.feat.main.title")}</h3>
              <p className="mt-3 text-ink-muted max-w-lg text-sm md:text-base leading-relaxed">
                {t("landing.feat.main.text")}
              </p>
              <div className="mt-5 md:mt-6 rounded-xl border border-line bg-bg-soft p-3 sm:p-4 inline-flex items-center gap-3 md:gap-4 flex-wrap">
                <div>
                  <div className="font-mono text-[10px] text-ink-hush">{t("landing.feat.main.before")}</div>
                  <div className="font-mono text-base sm:text-lg md:text-xl text-ink-hush tabular line-through decoration-orange decoration-2">2.00</div>
                </div>
                <Icons.ArrowRight />
                <div>
                  <div className="font-mono text-[10px] text-lime-deep font-semibold">TVelo</div>
                  <div className="font-mono text-base sm:text-lg md:text-xl text-ink tabular font-semibold">3.00 <span className="text-sm text-lime-deep">+50%</span></div>
                </div>
              </div>
            </div>
          </div>

          <BentoCard idx="02" icon={<Icons.Coverage />} title={t("landing.feat.cov.t")} text={t("landing.feat.cov.x")} accent="azure" />
          <BentoCard idx="03" icon={<Icons.Health />}   title={t("landing.feat.lost.t")}  text={t("landing.feat.lost.x")} accent="lime" />
          <BentoCard idx="04" icon={<Icons.Shield />}   title={t("landing.feat.plan.t")} text={t("landing.feat.plan.x")} accent="emerald" />
          <BentoCard idx="05" icon={<Icons.Bell />}     title={t("landing.feat.frozen.t")} text={t("landing.feat.frozen.x")} accent="orange" />
          <BentoCard idx="06" icon={<Icons.Plug />}     title={t("landing.feat.conf.t")} text={t("landing.feat.conf.x")} accent="azure" />
        </div>
      </div>
    </section>
  );
}
