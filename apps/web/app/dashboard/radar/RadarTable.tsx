"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { RadarTab } from "./page";
import { actionToggleFavorite, actionArchiveQuery, actionUnarchiveQuery } from "./actions";

type QueryRow = {
  id: string;
  brand_id: string;
  brand_name: string;
  query_text: string;
  status: RadarTab | "early";
  current_frequency: number | null;
  trend_pct: number | null;
  is_favorite: boolean;
  first_seen_at: string;
  last_updated_at: string;
  days_since_first_seen: number | null;
};

export default function RadarTable({
  queries, tab, brands, brandFilter, currentTabTitle, emptyStateMessage,
}: {
  queries: QueryRow[];
  tab: RadarTab;
  brands: Array<{ id: string; name: string; sku_count: number | null }>;
  brandFilter: string | null;
  currentTabTitle: string;
  /** Текст empty state передаётся снаружи — у каждой вкладки свой текст
      (см. TAB_EMPTY_STATES в page.tsx). Если не передан, фолбэк. */
  emptyStateMessage?: string;
}) {
  const [search, setSearch] = useState("");

  const filtered = search
    ? queries.filter(q =>
        q.query_text.toLowerCase().includes(search.toLowerCase()) ||
        q.brand_name.toLowerCase().includes(search.toLowerCase()))
    : queries;

  const defaultEmptyMessage = `Во вкладке «${currentTabTitle}» пока пусто. Данные появятся после следующего опроса.`;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по фразе или бренду…"
          className="flex-1 min-w-[200px] max-w-md px-3 py-2 rounded-lg border border-line bg-paper text-sm focus:outline-none focus:border-lime-deep/60"
        />
        <BrandPicker brands={brands} brandFilter={brandFilter} tab={tab} />
        <div className="text-xs font-mono text-ink-hush uppercase tracking-wider">
          {filtered.length} / {queries.length}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-paper p-8 text-center text-sm text-ink-muted">
          {queries.length === 0
            ? (emptyStateMessage ?? defaultEmptyMessage)
            : "Под фильтр ничего не подходит."}
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-paper overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg-soft border-b border-line">
                <tr className="text-left">
                  <Th className="w-10"></Th>
                  <Th>Фраза</Th>
                  <Th>Бренд</Th>
                  <Th align="right">Частота</Th>
                  <Th align="center">Тренд</Th>
                  <Th align="right">Дней</Th>
                  <Th className="w-24"></Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(q => <Row key={q.id} q={q} tab={tab} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children, align, className = "" }: { children?: React.ReactNode; align?: "right" | "center"; className?: string }) {
  const a = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th className={`${className} ${a} font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold px-3 py-2.5`}>
      {children}
    </th>
  );
}

function Row({ q, tab }: { q: QueryRow; tab: RadarTab }) {
  const [pending, startTransition] = useTransition();

  const onFav = () => startTransition(async () => {
    await actionToggleFavorite(q.id, !q.is_favorite);
  });
  const onArchive = () => startTransition(async () => {
    if (tab === "archived") await actionUnarchiveQuery(q.id);
    else await actionArchiveQuery(q.id);
  });

  const trendColor =
    q.trend_pct == null ? "text-ink-hush" :
    q.trend_pct > 20    ? "text-lime-deep" :
    q.trend_pct > 0     ? "text-ink-muted" :
                          "text-orange";

  return (
    <tr className="border-b border-line last:border-b-0 hover:bg-bg-soft/50 transition">
      <td className="px-3 py-2.5">
        <button
          onClick={onFav}
          disabled={pending}
          aria-label={q.is_favorite ? "Убрать из избранного" : "Добавить в избранное"}
          className={`size-7 inline-flex items-center justify-center rounded transition ${
            q.is_favorite ? "text-lime-deep" : "text-ink-hush hover:text-lime-deep"
          }`}
        >
          {q.is_favorite ? "★" : "☆"}
        </button>
      </td>
      <td className="px-3 py-2.5">
        <div className="font-medium text-ink">{q.query_text}</div>
      </td>
      <td className="px-3 py-2.5 text-ink-muted">{q.brand_name}</td>
      <td className="px-3 py-2.5 text-right tabular font-mono text-sm">
        {q.current_frequency?.toLocaleString("ru") ?? "—"}
      </td>
      <td className={`px-3 py-2.5 text-center tabular font-mono text-xs ${trendColor}`}>
        {q.trend_pct == null ? "—" : `${q.trend_pct > 0 ? "+" : ""}${Math.round(q.trend_pct)}%`}
      </td>
      <td className="px-3 py-2.5 text-right tabular font-mono text-xs text-ink-muted">
        {q.days_since_first_seen ?? "—"}
      </td>
      <td className="px-3 py-2.5">
        <button
          onClick={onArchive}
          disabled={pending}
          className="text-xs font-mono uppercase tracking-wider text-ink-hush hover:text-ink transition px-2 py-1"
        >
          {tab === "archived" ? "Восст." : "В архив"}
        </button>
      </td>
    </tr>
  );
}

function BrandPicker({
  brands, brandFilter, tab,
}: {
  brands: Array<{ id: string; name: string }>;
  brandFilter: string | null;
  tab: RadarTab;
}) {
  const buildHref = (brandId: string | null) => {
    const params = new URLSearchParams();
    if (tab !== "new") params.set("tab", tab);
    if (brandId) params.set("brand", brandId);
    const qs = params.toString();
    return `/dashboard/radar${qs ? `?${qs}` : ""}`;
  };

  const current = brands.find(b => b.id === brandFilter);

  return (
    <div className="flex items-center gap-1.5">
      {brandFilter && current ? (
        <Link
          href={buildHref(null) as any}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-lime-deep/40 bg-lime-soft/40 text-xs font-mono text-lime-deep hover:bg-lime-soft/60 transition"
        >
          {current.name}
          <span className="text-ink-hush">×</span>
        </Link>
      ) : (
        <select
          onChange={e => {
            if (typeof window !== "undefined" && e.target.value) {
              window.location.href = buildHref(e.target.value);
            }
          }}
          defaultValue=""
          className="px-2.5 py-1.5 rounded-lg border border-line bg-paper text-xs font-mono text-ink-muted focus:outline-none focus:border-lime-deep/60"
        >
          <option value="">Все бренды</option>
          {brands.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}
