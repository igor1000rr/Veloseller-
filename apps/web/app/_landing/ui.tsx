/**
 * Мелкие UI-блоки лендинга, перенесены из page.tsx без изменений разметки.
 * PricingCard: цена по локали — РФ «2 500 ₽ /мес» (1:1 со старым рендером),
 * en «$29 /mo» через formatPlanPrice. fromPrice — приставка «от» для Конструктора.
 */
import Link from "next/link";
import { Icons } from "../_components/Icons";
import { t } from "@/lib/i18n";
import { formatPlanPrice } from "@/lib/plans";
import { isEn, type LandingPlan } from "./data";

export function Eyebrow({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <div className={`inline-flex items-center gap-2 ${center ? "" : ""}`}>
      <span className="size-1 rounded-full bg-lime-deep" />
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">{children}</span>
    </div>
  );
}

export function BentoCard({ idx, icon, title, text, accent }: {
  idx: string; icon: React.ReactNode; title: string; text: string;
  accent: "lime" | "azure" | "orange" | "emerald";
}) {
  const accentColor =
    accent === "lime"    ? "text-lime-deep bg-lime-soft" :
    accent === "azure"   ? "text-azure bg-azure/10" :
    accent === "emerald" ? "text-emerald bg-emerald/10" :
                           "text-orange bg-orange/10";
  return (
    <div className="rounded-2xl border border-line bg-paper p-5 sm:p-6 md:p-7 hover:border-lime-deep/40 hover:shadow-lg transition group">
      <div className="flex items-center justify-between">
        <div className={`flex size-11 items-center justify-center rounded-lg ${accentColor} group-hover:scale-110 transition`}>
          {icon}
        </div>
        <span className="font-mono text-[10px] text-ink-hush tabular">{idx}</span>
      </div>
      <h3 className="mt-5 font-display text-base sm:text-lg md:text-xl leading-tight font-medium">{title}</h3>
      <p className="mt-2 text-sm text-ink-muted leading-relaxed">{text}</p>
    </div>
  );
}

export function PricingCard({ name, price, highlight, perks, fromPrice, isAuthed }: LandingPlan & { isAuthed: boolean }) {
  return (
    <div className={`relative rounded-2xl p-5 sm:p-6 md:p-8 transition ${
      highlight
        ? "border-2 border-lime-deep bg-paper shadow-[0_20px_60px_-20px_rgba(132,204,22,0.3)]"
        : "border border-line bg-paper hover:shadow-lg"
    }`}>
      {highlight && (
        <span className="absolute -top-3 right-7 px-3 py-0.5 rounded-full bg-lime-deep text-paper font-mono text-[10px] uppercase tracking-widest">
          {t("landing.pr.popular")}
        </span>
      )}
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">{name}</div>
      <div className="mt-4 flex items-baseline gap-1 flex-wrap">
        {fromPrice && (
          <span className="text-ink-muted text-xl">{isEn ? "from" : "от"}</span>
        )}
        {isEn ? (
          <>
            <span className="font-display text-4xl sm:text-5xl md:text-6xl tracking-tight text-ink tabular font-medium">{formatPlanPrice(price)}</span>
            <span className="text-ink-muted">/mo</span>
          </>
        ) : (
          <>
            <span className="font-display text-4xl sm:text-5xl md:text-6xl tracking-tight text-ink tabular font-medium">{price.toLocaleString("ru-RU")}</span>
            <span className="text-ink-muted text-2xl ml-1">₽</span>
            <span className="text-ink-muted">/мес</span>
          </>
        )}
      </div>
      <ul className="mt-6 md:mt-7 space-y-3">
        {perks.map((perk) => (
          <li key={perk} className="flex items-start gap-2.5 text-sm md:text-[15px] text-ink-soft">
            <span className="text-lime-deep shrink-0 mt-0.5"><Icons.Check /></span>
            <span>{perk}</span>
          </li>
        ))}
      </ul>
      <Link
        href={(isAuthed ? "/billing" : "/register") as any}
        className={`mt-7 md:mt-8 block rounded-lg px-4 py-3 text-center text-sm font-semibold transition ${
          highlight
            ? "bg-ink text-paper hover:bg-ink-soft"
            : "bg-bg-soft text-ink border border-line hover:border-lime-deep/40"
        }`}
      >
        {isAuthed ? t("landing.pr.manage") : t("landing.pr.startFree")}
      </Link>
    </div>
  );
}

export function FooterCol({ title, items }: { title: string; items: [string, string][] }) {
  return (
    <div className="col-span-1 md:col-span-2">
      <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">{title}</div>
      <ul className="mt-4 space-y-2.5 text-sm">
        {items.map(([href, label]) => (
          <li key={label}>
            <Link href={href as any} className="text-ink-soft hover:text-lime-deep transition">{label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
