import Link from "next/link";
import { Eyebrow } from "./ui";
import { isEn } from "./data";

// Промо-секция мобильного приложения на главной. Приложения в разработке —
// ведём на /apps (подробности + ранний доступ). Двуязычно через isEn, чтобы
// .com (EN) не показывал русский. Когда приложения выйдут — заменить на сторы.
const COPY = isEn
  ? {
      eyebrow: "Mobile app · soon",
      h2: "Veloseller in your pocket — soon",
      sub: "Stock, sales velocity and out-of-stock risk on your phone. A push the moment it's time to reorder.",
      points: ["Dashboard on the go", "Reorder push alerts", "WB & Ozon warehouses"],
      more: "Learn more",
      cta: "Early access",
    }
  : {
      eyebrow: "Мобильное приложение · скоро",
      h2: "Скоро Veloseller в вашем телефоне",
      sub: "Остатки, скорость продаж и риск out-of-stock — на телефоне. Push, как только товар пора дозаказать.",
      points: ["Дашборд на ходу", "Push о дозаказе", "Склады WB и Ozon"],
      more: "Подробнее",
      cta: "Ранний доступ",
    };

export default function LandingApps() {
  return (
    <section
      id="apps"
      className="relative w-full px-4 md:px-8 lg:px-12 py-8 md:py-12 border-t border-line bg-bg-soft"
    >
      <div className="max-w-[1600px] mx-auto">
        <div className="rounded-2xl border border-line bg-paper p-6 md:p-10 flex flex-col md:flex-row md:items-center gap-8">
          <div className="flex-1">
            <Eyebrow>{COPY.eyebrow}</Eyebrow>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-4xl tracking-tight font-medium">
              {COPY.h2}
            </h2>
            <p className="mt-3 text-ink-muted max-w-xl text-sm md:text-base leading-relaxed">
              {COPY.sub}
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              {COPY.points.map((p) => (
                <span key={p} className="rounded-full border border-line bg-bg-soft px-3 py-1 text-xs text-ink-soft">
                  {p}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3 shrink-0 w-full md:w-auto">
            <Link href={"/apps" as any} className="rounded-lg bg-ink text-paper px-6 py-3 text-sm font-semibold text-center hover:bg-ink-soft transition">
              {COPY.more}
            </Link>
            <Link href={"/register" as any} className="rounded-lg bg-bg-soft text-ink border border-line px-6 py-3 text-sm font-semibold text-center hover:border-lime-deep/40 transition">
              {COPY.cta}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
