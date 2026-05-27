"use client";
import { useState } from "react";

type Tab = "early" | "new" | "watching" | "archived";

type Query = {
  id: string;
  query_text: string;
  current_frequency: number;
  trend_pct: number | null;
  present_in_wb: boolean;
  present_in_ozon: boolean;
  is_favorite: boolean;
  status: string;
  first_seen_at: string;
  last_updated_at: string;
  brand_id: string;
  radar_brands: { name: string } | null;
};

export function QueriesTable({ queries, tab }: { queries: Query[]; tab: Tab }) {
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (queries.length === 0) {
    return <EmptyState tab={tab} />;
  }

  async function performAction(
    queryId: string,
    action: "favorite" | "archive" | "unarchive" | "watch" | "unwatch"
  ) {
    setPendingId(queryId);
    try {
      const res = await fetch(`/api/radar/queries/${queryId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        // Простая стратегия: перезагрузка страницы, чтобы пересчитались счётчики
        // вкладок и обновился список. Можно потом сделать оптимистичный апдейт.
        window.location.reload();
      } else {
        alert("Не удалось выполнить действие");
      }
    } catch (e) {
      console.error(e);
      alert("Ошибка соединения");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-paper overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-bg-soft border-b border-line">
            <tr>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">★</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Запрос</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Бренд</th>
              <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Частота</th>
              <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Тренд</th>
              <th className="text-center px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">WB</th>
              <th className="text-center px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">OZON</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Появилось</th>
              <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Действия</th>
            </tr>
          </thead>
          <tbody>
            {queries.map((q) => {
              const trendClass = q.trend_pct == null ? "text-ink-hush"
                : q.trend_pct > 0 ? "text-lime-deep"
                : q.trend_pct < 0 ? "text-rose"
                : "text-ink-muted";
              const daysAgo = Math.floor((Date.now() - new Date(q.first_seen_at).getTime()) / 86400000);
              return (
                <tr key={q.id} className="border-b border-line last:border-0 hover:bg-bg-soft/40 transition">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => performAction(q.id, q.is_favorite ? "unwatch" : "favorite")}
                      disabled={pendingId === q.id}
                      className={`inline-flex items-center justify-center size-6 rounded transition ${
                        q.is_favorite ? "text-orange" : "text-ink-hush hover:text-orange"
                      }`}
                      aria-label="Избранное"
                    >
                      {q.is_favorite ? "★" : "☆"}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-medium text-ink">{q.query_text}</td>
                  <td className="px-4 py-3 text-ink-muted">{q.radar_brands?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular text-ink">
                    {q.current_frequency.toLocaleString("ru-RU")}
                  </td>
                  <td className={`px-4 py-3 text-right tabular ${trendClass}`}>
                    {q.trend_pct == null ? "—" : `${q.trend_pct > 0 ? "+" : ""}${q.trend_pct.toFixed(0)}%`}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {q.present_in_wb ? (
                      <span className="inline-flex items-center justify-center size-5 rounded bg-lime-soft text-lime-deep text-xs">✓</span>
                    ) : (
                      <span className="text-ink-hush">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {q.present_in_ozon ? (
                      <span className="inline-flex items-center justify-center size-5 rounded bg-lime-soft text-lime-deep text-xs">✓</span>
                    ) : (
                      <span className="text-ink-hush">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-muted text-xs">
                    {daysAgo === 0 ? "сегодня" : daysAgo === 1 ? "вчера" : `${daysAgo} дн назад`}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {q.status === "archived" ? (
                      <button
                        onClick={() => performAction(q.id, "unarchive")}
                        disabled={pendingId === q.id}
                        className="text-xs font-mono uppercase tracking-wider text-lime-deep hover:underline"
                      >
                        восстановить
                      </button>
                    ) : (
                      <button
                        onClick={() => performAction(q.id, "archive")}
                        disabled={pendingId === q.id}
                        className="text-xs font-mono uppercase tracking-wider text-ink-hush hover:text-rose"
                      >
                        архив
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const labels: Record<Tab, { title: string; sub: string }> = {
    new: {
      title: "Пока нет новых сигналов",
      sub: "Worker опрашивает Wordstat раз в 3 дня и suggest WB/OZON ежедневно. Первые результаты обычно появляются через 1-3 дня после добавления брендов.",
    },
    early: {
      title: "Пока нет ранних сигналов",
      sub: "Сюда попадают запросы которые показал Wordstat, но товара ещё нет в WB и OZON. Самые ценные сигналы — спрос есть, конкуренции ещё нет.",
    },
    watching: {
      title: "Список наблюдения пуст",
      sub: "Отметьте звёздочкой интересные запросы — они появятся здесь и в Telegram-дайджестах.",
    },
    archived: {
      title: "Архив пуст",
      sub: "Сюда отправляются запросы которые вы убрали из выдачи.",
    },
  };

  const l = labels[tab];

  return (
    <div className="rounded-2xl border border-line bg-paper p-12 text-center">
      <h3 className="font-display text-xl font-medium text-ink">{l.title}</h3>
      <p className="mt-2 text-sm text-ink-muted max-w-md mx-auto">{l.sub}</p>
    </div>
  );
}
