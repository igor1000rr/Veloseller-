/** Сравнение Excel vs Veloseller, «Как это работает», отзывы. Перенос из page.tsx 1:1. */
import { Icons } from "../_components/Icons";
import { t } from "@/lib/i18n";
import { Eyebrow } from "./ui";
import { compareLeft, compareRight, steps, testimonials } from "./data";

export default function LandingStory() {
  return (
    <>
      {/* ===== СРАВНЕНИЕ ===== */}
      <section className="relative w-full px-4 md:px-8 lg:px-12 py-8 md:py-12 border-t border-line">
        <div className="max-w-[1600px] mx-auto">
          <div className="text-center mb-10 md:mb-14">
            <Eyebrow center>{t("landing.cmp.eyebrow")}</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-5xl tracking-tight font-medium">
              Excel vs Veloseller
            </h2>
            <p className="mt-3 text-ink-muted text-sm md:text-base">
              {t("landing.cmp.sub")}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4 md:gap-6">
            <div className="rounded-2xl border-2 border-line bg-bg-soft p-5 sm:p-6 md:p-8 relative">
              <div className="absolute -top-3 left-7 px-2.5 py-0.5 rounded bg-paper border border-line-2">
                <span className="font-mono text-[10px] text-ink-hush uppercase tracking-widest">{t("landing.cmp.before")}</span>
              </div>
              <h3 className="font-display text-lg sm:text-xl md:text-2xl mt-3 text-ink-muted font-medium">{t("landing.cmp.left")}</h3>
              <ul className="mt-5 space-y-3">
                {compareLeft.map((it) => (
                  <li key={it} className="flex items-start gap-3 text-ink-muted text-sm md:text-base">
                    <span className="text-rose shrink-0 mt-0.5"><Icons.Cross /></span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border-2 border-lime-deep/40 bg-lime-soft p-5 sm:p-6 md:p-8 relative shadow-[0_20px_60px_-20px_rgba(132,204,22,0.3)]">
              <div className="absolute -top-3 left-7 px-2.5 py-0.5 rounded bg-ink text-paper">
                <span className="font-mono text-[10px] uppercase tracking-widest">{t("landing.cmp.after")}</span>
              </div>
              <h3 className="font-display text-lg sm:text-xl md:text-2xl mt-3 text-ink font-medium">Veloseller</h3>
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

      {/* ===== TESTIMONIALS ===== */}
      <section className="relative w-full px-4 md:px-8 lg:px-12 py-8 md:py-12 border-t border-line">
        <div className="max-w-[1600px] mx-auto">
          <div className="text-center mb-10 md:mb-14">
            <Eyebrow center>{t("landing.ts.eyebrow")}</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-5xl tracking-tight font-medium">
              {t("landing.ts.h2")}
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4 md:gap-5">
            {testimonials.map((item, i) => (
              <div key={i} className="rounded-2xl border border-line bg-paper p-5 sm:p-6 md:p-7 hover:shadow-lg transition">
                <div className="flex items-center gap-1 text-lime-deep">
                  {[...Array(5)].map((_, j) => <Icons.Star key={j} />)}
                </div>
                <p className="mt-4 text-sm md:text-[15px] text-ink-soft leading-relaxed">{item.quote}</p>
                <div className="mt-5 md:mt-6 flex items-center gap-3">
                  <div className="size-10 rounded-full flex items-center justify-center font-display text-base font-medium shrink-0" style={{ background: item.avatarBg, color: item.avatarColor }}>
                    {item.initials}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-ink truncate">{item.name}</div>
                    <div className="font-mono text-[10px] text-ink-hush uppercase tracking-wider truncate">{item.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
