/**
 * Маленький знак «i» для подсказок на метриках.
 * Pure CSS hover — работает в server components без "use client".
 *
 * При наведении показывает блюпринт с объяснением как считается метрика.
 */
export function InfoTooltip({ text, position = "top" }: { text: string; position?: "top" | "bottom" | "left" }) {
  const positionClass = {
    top: "left-1/2 -translate-x-1/2 bottom-full mb-2",
    bottom: "left-1/2 -translate-x-1/2 top-full mt-2",
    left: "right-full mr-2 top-1/2 -translate-y-1/2",
  }[position];

  return (
    <span className="group relative inline-flex items-center align-middle ml-1">
      <span className="size-3.5 rounded-full bg-ink-hush/15 text-ink-hush text-[9px] font-bold flex items-center justify-center cursor-help hover:bg-ink-hush/30 hover:text-ink transition select-none">
        i
      </span>
      <span
        className={`invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity absolute ${positionClass} px-3 py-2 rounded-md bg-ink text-paper text-[11px] leading-snug font-normal normal-case tracking-normal w-64 text-left z-50 pointer-events-none shadow-lg`}
      >
        {text}
      </span>
    </span>
  );
}
