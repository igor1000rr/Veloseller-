/** Статы, marquee интеграций и превью дашборда. Перенос из page.tsx 1:1. */
import DashboardPreview from "./DashboardPreviewLazy";
import { t } from "@/lib/i18n";
import { Eyebrow } from "./ui";
import { stats, integrations } from "./data";

export default function LandingShowcase() {
  return (
    <>
      {/* ===== STATS ===== */}
      <section className="relative w-full px-4 md:px-8 lg:px-12 py-8 md:py-10 border-y border-line bg-bg-soft">
        <div className="max-w-[1600px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10">
          {stats.map((s, i) => (
            <div key={i} className="relative">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hush">{s.label}</div>
              <div className="mt-1.5 font-display text-2xl sm:text-3xl md:text-5xl tabular tracking-tight font-medium break-words">
                {s.value}
                {s.unit && <span className="text-lg sm:text-xl md:text-2xl text-ink-muted ml-0.5">{s.unit}</span>}
              </div>
              <div className="mt-0.5 text-xs text-ink-muted">{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== INTEGRATIONS marquee ===== */}
      <section id="integrations" className="relative w-full py-8 md:py-12 border-b border-line overflow-hidden">
        <div className="w-full px-4 md:px-8 lg:px-12 mb-8 md:mb-10 max-w-[1600px] mx-auto">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <Eyebrow>{t("landing.nav.integrations")}</Eyebrow>
              <h2 className="mt-2 font-display text-2xl md:text-4xl tracking-tight font-medium">
                {t("landing.int.h2a")}<br className="hidden md:block"/> {t("landing.int.h2b")}
              </h2>
            </div>
            <p className="text-ink-muted text-sm md:text-[15px] max-w-md">
              {t("landing.int.sub")}
            </p>
          </div>
        </div>

        <div className="relative">
          <div className="absolute left-0 top-0 bottom-0 w-16 md:w-32 bg-gradient-to-r from-bg to-transparent z-10" />
          <div className="absolute right-0 top-0 bottom-0 w-16 md:w-32 bg-gradient-to-l from-bg to-transparent z-10" />
          <div className="flex marquee-track gap-3 md:gap-4 w-max">
            {[...integrations, ...integrations].map((src, i) => {
              const isSoon = src.tag === "SOON";
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 rounded-xl border bg-paper px-5 md:px-7 py-4 md:py-5 shrink-0 transition shadow-sm ${
                    isSoon
                      ? "border-orange/30 hover:border-orange/50"
                      : "border-line hover:border-lime-deep/40"
                  }`}
                >
                  <span className="size-2.5 rounded-full" style={{ background: src.dot }} />
                  <span className={`font-display text-base md:text-xl tracking-tight font-medium ${isSoon ? "text-ink-muted" : "text-ink"}`}>
                    {src.name}
                  </span>
                  <span className={`font-mono text-[10px] uppercase tracking-widest font-semibold ${
                    isSoon ? "text-orange border border-orange/30 bg-orange/10 px-1.5 py-0.5 rounded" : "text-ink-hush"
                  }`}>
                    {src.tag}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== DASHBOARD PREVIEW ===== */}
      <section className="relative w-full px-4 md:px-8 lg:px-12 py-8 md:py-12">
        <div className="max-w-[1600px] mx-auto">
          <div className="flex items-end justify-between mb-8 md:mb-10 flex-wrap gap-4">
            <div>
              <Eyebrow>{t("landing.dash.eyebrow")}</Eyebrow>
              <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-5xl tracking-tight max-w-2xl font-medium">
                {t("landing.dash.h2a")} <span className="text-ink-hush">{t("landing.dash.h2b")}</span>
              </h2>
            </div>
            <p className="text-ink-muted max-w-md text-sm md:text-[15px]">
              {t("landing.dash.sub")}
            </p>
          </div>
          <DashboardPreview />
        </div>
      </section>
    </>
  );
}
