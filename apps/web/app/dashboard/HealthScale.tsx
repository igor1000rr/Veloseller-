/**
 * Шкала здоровья склада по Rule 13.2:
 *  90-100 = Отлично
 *  75-89  = Хорошо
 *  60-74  = Внимание
 *  40-59  = Риск
 *  0-39   = Критично
 *
 * Правка 4.1 Александра (Правки 4): SKU без активности исключаются
 * из расчёта на бекенде (apps/worker/app/jobs/recalc.py::_write_store_metrics).
 * Информация про это выводится в тултипе HealthScoreBlock.
 */
import { InfoTooltip } from "../_components/InfoTooltip";

export function HealthScale({
  score,
  size = "md",
}: {
  score: number | null | undefined;
  size?: "sm" | "md" | "lg";
}) {
  if (score == null) {
    return (
      <div className="inline-flex items-center gap-2">
        <span className="inline-flex items-center font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border border-line-2 bg-bg-soft text-ink-hush font-semibold">
          нет данных
        </span>
      </div>
    );
  }

  const v = Number(score);
  const tier = pickTier(v);

  const sizeMap = {
    sm: "text-[9px] px-1.5 py-0.5",
    md: "text-[10px] px-2 py-0.5",
    lg: "text-xs px-2.5 py-1",
  };

  return (
    <span
      className={`inline-flex items-center font-mono uppercase tracking-widest rounded border font-semibold whitespace-nowrap ${sizeMap[size]} ${tier.cls}`}
    >
      {tier.label}
    </span>
  );
}

/**
 * Большой блок здоровья склада: число + бейдж шкалы + визуальная полоска.
 *
 * Mobile-friendly: число адаптивное (2.5rem на мобиле, 3.25rem на десктопе),
 * padding p-4 на мобиле.
 */
export function HealthScoreBlock({ score }: { score: number | null | undefined }) {
  const v = score == null ? null : Number(score);
  const tier = v == null ? null : pickTier(v);
  const pct = v == null ? 0 : Math.max(0, Math.min(100, v));

  return (
    <div className="rounded-2xl border border-line bg-paper p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold flex items-center">
          Состояние склада
          <InfoTooltip text="Взвешенная оценка здоровья склада (0-100): health_score по SKU взвешивается по стоимости остатка, из этого вычитается вес дефицитных SKU. SKU без активности (нет остатка и нет движений за 30 дней) в расчёт не включаются." />
        </div>
        <HealthScale score={v} size="md" />
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span
          className="font-display tabular tracking-tight font-medium text-[2.5rem] sm:text-[3.25rem]"
          style={{
            lineHeight: 1,
            color: tier?.numberColor ?? "#1f2017",
          }}
        >
          {v != null ? v.toFixed(0) : "—"}
        </span>
        <span className="text-ink-hush font-mono text-base sm:text-lg">/100</span>
      </div>

      {/* Шкала-полоска с отметками границ тиров (40/60/75/90) */}
      <div className="mt-5 relative">
        <div className="h-2 rounded-full bg-bg-soft border border-line overflow-hidden">
          <div className="h-full bg-gradient-to-r from-rose via-orange to-lime-deep" style={{ width: "100%" }} />
        </div>
        {v != null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 size-3 rounded-full bg-ink border-2 border-paper shadow-md"
            style={{ left: `calc(${pct}% - 6px)` }}
          />
        )}
        <div className="mt-2 flex justify-between font-mono text-[9px] text-ink-hush uppercase tracking-wider">
          <span>0</span><span>40</span><span>60</span><span>75</span><span>90</span><span>100</span>
        </div>
      </div>

      {tier && (
        <p className="mt-4 text-xs text-ink-muted leading-relaxed">{tier.hint}</p>
      )}
    </div>
  );
}

type Tier = {
  label: string;
  cls: string;
  numberColor: string;
  hint: string;
};

function pickTier(score: number): Tier {
  if (score >= 90) return {
    label: "Отлично",
    cls: "text-lime-deep border-lime-deep/40 bg-lime-soft",
    numberColor: "#3f6212",
    hint: "Склад в отличной форме — нет ни дефицита, ни неликвида.",
  };
  if (score >= 75) return {
    label: "Хорошо",
    cls: "text-lime-deep border-lime-deep/30 bg-lime-soft",
    numberColor: "#3f6212",
    hint: "Склад работает хорошо — есть небольшие точки роста.",
  };
  if (score >= 60) return {
    label: "Внимание",
    cls: "text-orange border-orange/30 bg-orange/10",
    numberColor: "#b45309",
    hint: "Есть риски — проверь заканчивающиеся SKU и неликвид.",
  };
  if (score >= 40) return {
    label: "Риск",
    cls: "text-orange border-orange/40 bg-orange/15",
    numberColor: "#9a3412",
    hint: "Нужно вмешательство — много отсутствующих или замороженных позиций.",
  };
  return {
    label: "Критично",
    cls: "text-rose border-rose/40 bg-rose/15",
    numberColor: "#be123c",
    hint: "Критическое состояние склада — срочно разбирайся с дефицитом или неликвидом.",
  };
}
