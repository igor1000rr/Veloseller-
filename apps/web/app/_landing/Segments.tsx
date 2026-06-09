/**
 * Блок «этапы роста» (правка 10, #9): для кого Veloseller на разных стадиях.
 * Стиль — как у Features: Eyebrow + h2 + сетка карточек, но внутри карточки
 * чек-лист (Icons.Check) вместо описания. Тексты — segments/segmentsHead из data.
 */
import { Icons } from "../_components/Icons";
import { Eyebrow } from "./ui";
import { segments, segmentsHead } from "./data";

// Те же литералы классов, что в BentoCard — Tailwind их уже генерит, purge не съест.
const ACCENT: Record<string, string> = {
  lime: "text-lime-deep bg-lime-soft",
  azure: "text-azure bg-azure/10",
  emerald: "text-emerald bg-emerald/10",
  orange: "text-orange bg-orange/10",
};

const ICON: Record<string, React.ReactNode> = {
  "01": <Icons.Speed />,
  "02": <Icons.Health />,
  "03": <Icons.Coverage />,
};

export default function LandingSegments() {
  return (
    <section
      id="segments"
      className="relative w-full px-4 md:px-8 lg:px-12 py-8 md:py-12 border-t border-line bg-paper-warm"
    >
      <div className="max-w-[1600px] mx-auto">
        <div className="text-center mb-10 md:mb-14">
          <Eyebrow center>{segmentsHead.eyebrow}</Eyebrow>
          <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-5xl tracking-tight font-medium">
            {segmentsHead.h2}
          </h2>
          <p className="mt-4 text-ink-muted max-w-2xl mx-auto text-sm md:text-base">
            {segmentsHead.sub}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 items-start">
          {segments.map((seg) => (
            <div
              key={seg.idx}
              className="rounded-2xl border border-line bg-paper p-5 sm:p-6 md:p-7 hover:border-lime-deep/40 hover:shadow-lg transition"
            >
              <div className="flex items-center justify-between">
                <div
                  className={`flex size-11 items-center justify-center rounded-lg ${
                    ACCENT[seg.accent] ?? ACCENT.lime
                  }`}
                >
                  {ICON[seg.idx]}
                </div>
                <span className="font-mono text-[10px] text-ink-hush tabular">{seg.idx}</span>
              </div>
              <h3 className="mt-5 font-display text-base sm:text-lg md:text-xl leading-tight font-medium">
                {seg.title}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {seg.items.map((it) => (
                  <li key={it} className="flex items-start gap-2.5 text-sm text-ink-soft leading-relaxed">
                    <span className="text-lime-deep shrink-0 mt-0.5">
                      <Icons.Check />
                    </span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
