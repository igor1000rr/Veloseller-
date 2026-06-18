import Link from "next/link";
import { Eyebrow } from "./ui";
import { isEn } from "./data";

// Промо-секция мобильного приложения на главной. Приложения в разработке —
// ведём на /apps (подробности + ранний доступ). Двуязычно через isEn, чтобы
// .com (EN) не показывал русский. Когда приложения выйдут — заменить на сторы.
const COPY = isEn
  ? {
      badge: "Mobile app · soon",
      h2: "Veloseller in your pocket — soon",
      sub: "Stock, sales velocity and out-of-stock risk on your phone. A push the moment it's time to reorder.",
      points: ["Dashboard on the go", "Reorder push alerts", "WB & Ozon warehouses"],
      more: "Learn more",
      cta: "Early access",
    }
  : {
      badge: "Мобильное приложение · скоро",
      h2: "Скоро Veloseller в вашем телефоне",
      sub: "Остатки, скорость продаж и риск out-of-stock — на телефоне. Push, как только товар пора дозаказать.",
      points: ["Дашборд на ходу", "Push о дозаказе", "Склады WB и Ozon"],
      more: "Подробнее",
      cta: "Ранний доступ",
    };

const PILL = ["bg-lime-soft text-lime-deep", "bg-azure/10 text-azure", "bg-emerald/10 text-emerald"];

export default function LandingApps() {
  return (
    <section
      id="apps"
      className="relative w-full px-4 md:px-8 lg:px-12 py-8 md:py-12 border-t border-line bg-bg-soft"
    >
      <div className="max-w-[1600px] mx-auto">
        <div className="reveal rounded-2xl border border-line bg-gradient-to-br from-paper via-paper to-lime-soft p-6 md:p-10 flex flex-col md:flex-row md:items-center gap-8 transition hover:shadow-xl hover:border-lime-deep/40">
          <div className="flex-1">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-lime-deep/30 bg-lime-soft">
              <span className="size-1.5 rounded-full bg-lime-deep animate-pulse" />
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime-deep font-semibold">{COPY.badge}</span>
            </span>
            <h2 className="mt-3 font-display text-2xl sm:text-3xl md:text-4xl tracking-tight font-medium">
              {COPY.h2}
            </h2>
            <p className="mt-3 text-ink-muted max-w-xl text-sm md:text-base leading-relaxed">
              {COPY.sub}
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              {COPY.points.map((p, i) => (
                <span key={p} className={"rounded-full px-3 py-1 text-xs font-medium " + PILL[i % 3]}>
                  {p}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3 shrink-0 w-full md:w-auto">
            <Link href={"/apps" as any} className="rounded-lg bg-ink text-paper px-6 py-3 text-sm font-semibold text-center hover:bg-ink-soft transition shadow-[0_10px_30px_-10px_rgba(10,10,8,0.45)] hover:-translate-y-0.5">
              {COPY.more}
            </Link>
            <Link href={"/register" as any} className="rounded-lg bg-paper text-ink border border-line px-6 py-3 text-sm font-semibold text-center hover:border-lime-deep/40 transition hover:-translate-y-0.5">
              {COPY.cta}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
