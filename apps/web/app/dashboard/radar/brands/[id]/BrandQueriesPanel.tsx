"use client";

import { useState, useTransition } from "react";
import {
  actionToggleFavorite,
  actionArchiveQuery,
  actionUnarchiveQuery,
} from "../../actions";

type Query = {
  id: string;
  brand_id: string;
  brand_name?: string;
  query_text: string;
  current_frequency: number | null;
  trend_pct: number | null;
  present_in_wb: boolean | null;
  present_in_ozon: boolean | null;
  status: "early" | "new" | "watching" | "archived";
  is_favorite: boolean | null;
  first_seen_at: string;
  last_updated_at: string;
};

const STATUS_TABS = [
  { id: "early",    label: "Ранние" },
  { id: "new",      label: "Новые" },
  { id: "watching", label: "Наблюдение" },
  { id: "archived", label: "Архив" },
] as const;

type StatusFilter = (typeof STATUS_TABS)[number]["id"] | "all";

export default function BrandQueriesPanel({
  queries,
  perQueryHistory,
}: {
  queries: Query[];
  /** Помесячная history каждой фразы — словарь query_id → [{ym, freq}, ...] */
  perQueryHistory?: Record<string, { ym: string; freq: number }[]>;
}) {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const filtered = queries.filter(q => {
    if (filter !== "all" && q.status !== filter) return false;
    if (search.trim() && !q.query_text.toLowerCase().includes(search.toLowerCase().trim())) return false;
    return true;
  });

  if (queries.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-line bg-paper p-8 text-center">
        <h3 className="font-display text-lg font-medium text-ink">Worker ещё не опрашивал этот бренд</h3>
        <p className="mt-2 text-sm text-ink-muted max-w-md mx-auto">
          Radar опрашивает Wordstat раз в 3 дня. Если бренд добавлен только что —
          сигналы появятся в ближайшие сутки. До тех пор список будет пустым.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setFilter("all")}
            className={`font-mono text-[11px] uppercase tracking-wider px-3 py-1.5 rounded transition ${
              filter === "all" ? "bg-ink text-paper" : "text-ink-muted hover:text-ink"
            }`}
          >
            Все ({queries.length})
          </button>
          {STATUS_TABS.map(t => {
            const count = queries.filter(q => q.status === t.id).length;
            return (
              <button
                key={t.id}
                onClick={() => setFilter(t.id)}
                className={`font-mono text-[11px] uppercase tracking-wider px-3 py-1.5 rounded transition ${
                  filter === t.id ? "bg-ink text-paper" : "text-ink-muted hover:text-ink"
                }`}
              >
                {t.label} ({count})
              </button>
            );
          })}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск фразы…"
          className="px-3 py-1.5 text-sm border border-line rounded-lg bg-paper focus:outline-none focus:ring-2 focus:ring-lime-deep/30 w-48"
        />
      </div>

      <div className="rounded-2xl border border-line bg-paper overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-soft border-b border-line">
            <tr>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">
                Фраза
              </th>
              <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">
                Частота
              </th>
              <th className="text-center px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">
                Тренд
              </th>
              <th className="text-center px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">
                В каталогах
              </th>
              <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">
                Действия
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink-muted text-sm">
                  Ничего не найдено по фильтрам
                </td>
              </tr>
            )}
            {filtered.map((q) => (
              <QueryRow
                key={q.id}
                query={q}
                history={perQueryHistory?.[q.id]}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QueryRow({
  query,
  history,
}: {
  query: Query;
  history?: { ym: string; freq: number }[];
}) {
  const [pending, startTransition] = useTransition();

  const onFavorite = () => startTransition(async () => {
    await actionToggleFavorite(query.id, !query.is_favorite);
  });
  const onArchive = () => startTransition(async () => {
    if (query.status === "archived") {
      await actionUnarchiveQuery(query.id);
    } else {
      await actionArchiveQuery(query.id);
    }
  });

  const trend = query.trend_pct;
  const trendColor =
    trend == null ? "text-ink-hush"
    : trend > 5 ? "text-lime-deep"
    : trend < -5 ? "text-rose"
    : "text-ink-muted";

  return (
    <tr className={`border-b border-line last:border-0 transition ${
      query.status === "archived" ? "opacity-50" : "hover:bg-bg-soft/40"
    }`}>
      <td className="px-4 py-3">
        <div className="font-medium text-ink">{query.query_text}</div>
        {query.status === "watching" && (
          <span className="font-mono text-[9px] uppercase text-orange tracking-wider mt-0.5 inline-block">
            наблюдение
          </span>
        )}
        {query.status === "new" && (
          <span className="font-mono text-[9px] uppercase text-lime-deep tracking-wider mt-0.5 inline-block">
            новая
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular text-ink whitespace-nowrap">
        {query.current_frequency?.toLocaleString("ru-RU") ?? "—"}
      </td>
      <td className={`px-4 py-3 text-center whitespace-nowrap`}>
        {/* Sparkline + trend % компактно в одной ячейке */}
        <div className="inline-flex items-center gap-2">
          <MiniSparkline history={history} trendPct={trend} />
          <span className={`tabular text-xs font-mono ${trendColor}`}>
            {trend == null ? "—" : `${trend > 0 ? "+" : ""}${trend.toFixed(0)}%`}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-center text-xs whitespace-nowrap">
        <span className={`font-mono uppercase tracking-wider mr-1 ${
          query.present_in_wb ? "text-lime-deep" : "text-ink-hush"
        }`}>
          WB
        </span>
        <span className={`font-mono uppercase tracking-wider ${
          query.present_in_ozon ? "text-lime-deep" : "text-ink-hush"
        }`}>
          OZ
        </span>
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <button
          onClick={onFavorite}
          disabled={pending}
          className={`text-xs font-mono uppercase tracking-wider mr-3 transition ${
            query.is_favorite ? "text-orange" : "text-ink-hush hover:text-orange"
          }`}
          title={query.is_favorite ? "Убрать из наблюдения" : "В наблюдение"}
        >
          {query.is_favorite ? "★" : "☆"}
        </button>
        <button
          onClick={onArchive}
          disabled={pending}
          className="text-xs font-mono uppercase tracking-wider text-ink-hush hover:text-rose transition"
          title={query.status === "archived" ? "Вернуть из архива" : "В архив"}
        >
          {query.status === "archived" ? "восстановить" : "архив"}
        </button>
      </td>
    </tr>
  );
}

/**
 * Мини-sparkline для одной строки таблицы — компактный SVG 80×24.
 * Показывает последние 6 точек частоты фразы по месяцам.
 * Цвет линии: зелёный/красный/серый по trend_pct (синхронизирован с
 * текстовым значением рядом).
 *
 * Если history меньше 2 точек — не рендерим вообще (нечего показать).
 */
function MiniSparkline({
  history,
  trendPct,
}: {
  history?: { ym: string; freq: number }[];
  trendPct: number | null;
}) {
  if (!history || history.length < 2) {
    return <span className="inline-block w-[80px] h-[24px] text-ink-hush text-xs text-center leading-[24px]">—</span>;
  }

  const points = history.slice(-6);  // последние 6 месяцев
  const W = 80;
  const H = 24;
  const PAD = 2;
  const max = Math.max(...points.map(p => p.freq), 1);
  const min = Math.min(...points.map(p => p.freq), 0);
  const xStep = (W - PAD * 2) / Math.max(points.length - 1, 1);
  const yScale = (v: number) =>
    H - PAD - ((v - min) / (max - min || 1)) * (H - PAD * 2);

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${PAD + i * xStep} ${yScale(p.freq)}`)
    .join(" ");

  const color =
    trendPct == null ? "text-ink-hush"
    : trendPct > 5 ? "text-lime-deep"
    : trendPct < -5 ? "text-rose"
    : "text-ink-muted";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className={`inline-block ${color}`}
      style={{ verticalAlign: "middle" }}
    >
      <path d={pathD} fill="none" stroke="currentColor" strokeWidth="1.5" />
      {/* Последняя точка — кружочек для эмфазиса */}
      <circle
        cx={PAD + (points.length - 1) * xStep}
        cy={yScale(points[points.length - 1].freq)}
        r="1.5"
        fill="currentColor"
      >
        <title>
          {points.map(p => `${p.ym}: ${p.freq.toLocaleString("ru-RU")}`).join(" → ")}
        </title>
      </circle>
    </svg>
  );
}
