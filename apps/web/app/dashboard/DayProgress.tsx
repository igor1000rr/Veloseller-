import Link from "next/link";
import { Icons } from "../_components/Icons";

type Props = { daysSinceSetup: number };

/**
 * Онбординг-баннер по разделу «Продающие данные» из Project.docx.
 * Показывает селлеру что у него уже сейчас и что появится дальше.
 *
 *  Day 1   (сегодня, daysSinceSetup === 0)        — рассказываем что данные записали
 *  Day 1-7 (daysSinceSetup 1..6)                  — ждём семидневного окна для TVelo
 *  Day 7-30 (daysSinceSetup 7..29)                — TVelo работает, копим историю
 *  Day 30+                                        — баннер не показываем (Full insights)
 */
export function DayProgress({ daysSinceSetup }: Props) {
  if (daysSinceSetup >= 30) return null;

  let stage: "day1" | "day7" | "day30";
  if (daysSinceSetup >= 7) stage = "day30";
  else if (daysSinceSetup >= 1) stage = "day7";
  else stage = "day1";

  const content = {
    day1: {
      stageLabel: "Day 1",
      title: "Данные записаны",
      body: "За сегодня мы всё записали, но нам понадобится несколько дней, чтобы дать больше полезной информации.",
      next: "Через 7 дней появится: TVelo по каждому SKU, скорости продаж, lost revenue, заканчивающиеся остатки.",
      progress: 5,
    },
    day7: {
      stageLabel: `Day ${daysSinceSetup}`,
      title: "Первые расчёты в работе",
      body: `Прошло ${daysSinceSetup} ${pluralDay(daysSinceSetup)}. Накапливаем семидневное окно — TVelo входит в силу, когда будет 7 дней истории.`,
      next: `Через ${7 - daysSinceSetup} ${pluralDay(7 - daysSinceSetup)}: TVelo по SKU, OOS дни, lost revenue, заканчивающиеся остатки.`,
      progress: Math.round((daysSinceSetup / 30) * 100),
    },
    day30: {
      stageLabel: `Day ${daysSinceSetup}`,
      title: "TVelo работает",
      body: `Прошло ${daysSinceSetup} ${pluralDay(daysSinceSetup)}. Скорость продаж, покрытие и OOS уже видны — но confidence растёт каждый день.`,
      next: `Через ${30 - daysSinceSetup} ${pluralDay(30 - daysSinceSetup)}: помесячная динамика, недооценённые SKU, влияние цены, точные сегменты.`,
      progress: Math.round((daysSinceSetup / 30) * 100),
    },
  }[stage];

  return (
    <div className="relative rounded-2xl border border-lime-deep/30 bg-lime-soft p-5 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="shrink-0 mt-1 size-2 rounded-full bg-lime-deep animate-pulse" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime-deep font-semibold">
                {content.stageLabel} / Onboarding
              </span>
              <span className="font-mono text-[10px] tabular text-ink-hush">{content.progress}%</span>
            </div>
            <h3 className="mt-1 font-display text-lg md:text-xl text-ink font-medium">{content.title}</h3>
            <p className="mt-1.5 text-sm text-ink-soft leading-relaxed">{content.body}</p>
            <p className="mt-2 text-xs text-ink-muted leading-relaxed">
              <span className="text-lime-deep font-semibold mr-1">Дальше:</span>
              {content.next}
            </p>
          </div>
        </div>
        <Link
          href={"/onboarding" as any}
          className="hidden md:inline-flex items-center gap-1 text-xs text-ink-muted hover:text-lime-deep transition whitespace-nowrap shrink-0"
        >
          Гид <Icons.ArrowRight size={11} />
        </Link>
      </div>

      {/* Полоска прогресса 30 дней */}
      <div className="mt-4 h-1 rounded-full bg-paper border border-line overflow-hidden">
        <div
          className="h-full bg-lime-deep transition-all duration-500"
          style={{ width: `${content.progress}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[9px] text-ink-hush uppercase tracking-wider">
        <span>Day 1</span>
        <span>Day 7</span>
        <span>Day 30 — full insights</span>
      </div>
    </div>
  );
}

function pluralDay(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "дней";
  const last = n % 10;
  if (last === 1) return "день";
  if (last >= 2 && last <= 4) return "дня";
  return "дней";
}
