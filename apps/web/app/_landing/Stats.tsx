/**
 * Полоса с реальными цифрами (правка 10, #8). РФ-прод; на .com не рендерится.
 * Живые значения из system_settings['landing_live_stats'] (воркер раз в месяц,
 * jobs/landing_stats.py); при отсутствии ключа или ошибке — fallback liveStats.
 */
import { isEn, liveStats, liveStatsCaption, type LiveStat } from "./data";
import { getSetting } from "@/lib/admin/system-settings";

export default async function LandingStats() {
  if (isEn) return null;

  let items: LiveStat[] = liveStats;
  try {
    const live = await getSetting<LiveStat[]>("landing_live_stats", liveStats);
    if (Array.isArray(live) && live.length === 4) items = live;
  } catch {
    // публичный лендинг не должен падать из-за чтения настроек — остаёмся на fallback
  }

  return (
    <section className="relative w-full px-4 md:px-8 lg:px-12 py-6 md:py-8 border-t border-line bg-paper">
      <div className="max-w-[1600px] mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {liveStats.map((s) => (
            <div key={s.label} className="text-center md:text-left">
              <div className="font-display text-3xl sm:text-4xl md:text-5xl tracking-tight font-medium text-ink tabular">
                {s.value}
                {s.unit ? (
                  <span className="text-ink-muted text-base sm:text-lg md:text-xl ml-1.5 font-normal">{s.unit}</span>
                ) : null}
              </div>
              <div className="mt-1.5 text-xs sm:text-sm text-ink-muted leading-snug">{s.label}</div>
            </div>
          ))}
        </div>
        <p className="mt-5 md:mt-6 text-center md:text-left font-mono text-[10px] uppercase tracking-[0.15em] text-ink-hush">
          {liveStatsCaption}
        </p>
      </div>
    </section>
  );
}
