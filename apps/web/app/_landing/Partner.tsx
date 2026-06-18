import Link from "next/link";
import { isEn } from "./data";

// Промо-секция партнёрской программы на главной — баланс к блоку приложения.
// Ведёт на /partner (условия, калькулятор, заявка). Двуязычно через isEn.
// Акцент azure, чтобы отличаться от lime-блока приложения.
const COPY = isEn
  ? {
      badge: "Partner program",
      h2: "Refer clients — earn 20% for life",
      sub: "For agencies, consultants and services for sellers: recommend Veloseller and earn on every client payment, for as long as they stay with us.",
      points: ["20% of payments", "For life", "Monthly payouts"],
      more: "Terms & calculator",
      cta: "Become a partner",
    }
  : {
      badge: "Партнёрская программа",
      h2: "Приводите клиентов — получайте 20% пожизненно",
      sub: "Агентствам, консультантам и сервисам для селлеров: рекомендуйте Veloseller и зарабатывайте с каждого платежа клиента, пока он с нами.",
      points: ["20% с платежей", "Пожизненно", "Выплаты каждый месяц"],
      more: "Условия и расчёт",
      cta: "Стать партнёром",
    };

const PILL = ["bg-azure/10 text-azure", "bg-lime-soft text-lime-deep", "bg-emerald/10 text-emerald"];

export default function LandingPartner() {
  return (
    <section
      id="partner"
      className="relative w-full px-4 md:px-8 lg:px-12 py-8 md:py-12 border-t border-line bg-bg-soft"
    >
      <div className="max-w-[1600px] mx-auto">
        <div className="reveal rounded-2xl border border-line bg-gradient-to-br from-paper via-paper to-azure/10 p-6 md:p-10 flex flex-col md:flex-row md:items-center gap-8 transition hover:shadow-xl hover:border-azure/40">
          <div className="flex-1">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-azure/30 bg-azure/10">
              <span className="size-1.5 rounded-full bg-azure animate-pulse" />
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-azure font-semibold">{COPY.badge}</span>
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
            <Link href={"/partner" as any} className="rounded-lg bg-ink text-paper px-6 py-3 text-sm font-semibold text-center hover:bg-ink-soft transition shadow-[0_10px_30px_-10px_rgba(10,10,8,0.45)] hover:-translate-y-0.5">
              {COPY.cta}
            </Link>
            <Link href={"/partner#calc" as any} className="rounded-lg bg-paper text-ink border border-line px-6 py-3 text-sm font-semibold text-center hover:border-azure/40 transition hover:-translate-y-0.5">
              {COPY.more}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
