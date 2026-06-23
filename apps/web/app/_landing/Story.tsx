/** Сравнение Excel vs Veloseller, «Как это работает». Перенос из page.tsx 1:1. */
import { Icons } from "../_components/Icons";
import { t } from "@/lib/i18n";
import { Eyebrow } from "./ui";
import { compareLeft, compareMiddle, compareRight, steps } from "./data";

export default function LandingStory() {
  return (
    <>
      {/* ===== СРАВНЕНИЕ ===== */}
      <section className="relative w-full px-4 md:px-8 lg:px-12 py-8 md:py-12 border-t border-line">
        <div className="max-w-[1600px] mx-auto">
          <div className="text-center mb-10 md:mb-14">
            <Eyebrow center>{t("landing.cmp.eyebrow")}</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-5xl tracking-tight font-medium">
              {t("landing.cmp.h2")}
            </h2>
            <p className="mt-3 text-ink-muted text-sm md:text-base">
              {t("landing.cmp.sub")}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4 md:gap-6">
            {/* Excel — старый ручной способ (минусы) */}
            <div className="rounded-2xl border border-line bg-bg-soft p-5 sm:p-6 md:p-7">
              <h3 className="font-display text-lg sm:text-xl md:text-2xl text-ink-muted font-medium">{t("landing.cmp.left")}</h3>
              <ul className="mt-5 space-y-3">
                {compareLeft.map((it) => (
                  <li key={it} className="flex items-start gap-3 text-ink-muted text-sm md:text-base">
                    <span className="text-rose shrink-0 mt-0.5"><Icons.Cross /></span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
            {/* Другие сервисы — частично (нейтральный маркер) */}
            <div className="rounded-2xl border border-line bg-paper p-5 sm:p-6 md:p-7">
              <h3 className="font-display text-lg sm:text-xl md:text-2xl text-ink-soft font-medium">{t("landing.cmp.middle")}</h3>
              <ul className="mt-5 space-y-3">
                {compareMiddle.map((it) => (
                  <li key={it} className="flex items-start gap-3 text-ink-muted text-sm md:text-base">
                    <span className="shrink-0 mt-2 size-1.5 rounded-full bg-orange" />
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
            {/* Veloseller — полный охват (выделенная карточка) */}
            <div className="rounded-2xl border-2 border-lime-deep/40 bg-lime-soft p-5 sm:p-6 md:p-7 shadow-[0_20px_60px_-20px_rgba(132,204,22,0.3)]">
              <h3 className="font-display text-lg sm:text-xl md:text-2xl text-ink font-medium">Veloseller</h3>
              <ul className="mt-5 space-y-3">
                {compareRight.map((it) => (
                  <li key={it} className="flex items-start gap-3 text-ink-soft font-medium text-sm md:text-base">
                    <span className="text-lime-deep shrink-0 mt-0.5"><Icons.Check /></span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section id="how" className="relative w-full px-4 md:px-8 lg:px-12 py-8 md:py-12 border-t border-line bg-bg-soft">
        <div className="max-w-[1600px] mx-auto">
          <div className="text-center mb-12 md:mb-16">
            <Eyebrow center>{t("landing.how.eyebrow")}</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-5xl tracking-tight font-medium">
              {t("landing.how.h2a")} <span className="text-lime-deep italic">{t("landing.how.h2b")}</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4 md:gap-6">
            {steps.map((s, i) => (
              <div key={i} className="relative rounded-2xl border border-line bg-paper p-5 sm:p-6 md:p-7 hover:border-lime-deep/40 hover:shadow-lg transition">
                <div className="flex items-center justify-between">
                  <div className="font-display text-3xl sm:text-4xl md:text-5xl text-lime-deep/80 tabular font-medium">0{i + 1}</div>
                  <span className="font-mono text-[10px] text-ink-hush uppercase tracking-widest">{t("landing.how.step")} 0{i + 1}</span>
                </div>
                <h3 className="mt-4 md:mt-5 font-display text-base sm:text-lg md:text-xl font-medium">{s.title}</h3>
                <p className="mt-3 text-sm text-ink-muted leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
