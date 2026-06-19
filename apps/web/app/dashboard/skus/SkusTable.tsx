/**
 * Таблица SKU. Вынесена из page.tsx (монолит 34КБ не пролезал в MCP-пуш).
 * Server component: получает уже посчитанные строки и override-метрики периода.
 *
 * Александр 04.06.2026: артикул — без ссылки и чёрным. Ссылка для проваливания
 * в карточку SKU — название товара (зелёное, правка от 01.06.2026).
 */
import { VelocitySparkline } from "./VelocitySparkline";
import SkuLink from "./SkuLink";
import Link from "next/link";
import { InfoTooltip } from "../../_components/InfoTooltip";
import { NotesCell } from "./NotesCell";
import { t } from "@/lib/i18n";

/** Метрики, пересчитанные на лету за произвольный период (get_skus_period_metrics). */
export type PeriodMetricsRow = {
  product_id: string;
  velocity: number;
  in_stock_days: number;
  stockout_days: number;
  sales_units: number;
  current_stock: number;
  current_price: number | null;
  coverage_days: number | null;
  lost_revenue: number;
};

export function SkusTable({
  rows,
  selectedName,
  sparkData,
  salesByProduct,
  lostByProduct,
  lostUnitsByProduct,
  periodMetrics,
  reorderDays,
  displayPeriodDays,
}: {
  rows: any[];
  selectedName: string | null;
  sparkData: Record<string, number[]>;
  salesByProduct: Record<string, number>;
  lostByProduct: Record<string, number>;
  lostUnitsByProduct: Record<string, number>;
  periodMetrics: Map<string, PeriodMetricsRow> | null;
  reorderDays: number;
  displayPeriodDays: number;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-paper">
      <table className="min-w-full text-sm">
        <thead className="bg-bg-soft border-b border-line">
          <tr>
            <Th col="sku">{t("sku.col.sku")}</Th>
            <Th col="brand">{t("sku.col.brand")}</Th>
            <Th col="name">{t("sku.col.name")}</Th>
            <Th col="stock" align="right">{t("sku.col.stock")}</Th>
            <Th col="price" align="right">{t("sku.col.price")}</Th>
            <Th col="tvelo" align="right">{t("sku.col.tvelo")}</Th>
            <Th col="trend" align="center">{t("sku.col.trend")}</Th>
            <Th col="coverage" align="right">{t("sku.col.coverage")}</Th>
            {/* Александр 11.06.2026: «Дней без наличия (Nд)» → «OOS» + тултип (узкие строки) */}
            <Th col="oos" align="right">
              <span className="inline-flex items-center">
                {t("sku.col.oos")}
                <InfoTooltip text={t("sku.col.oosTip", { n: displayPeriodDays })} />
              </span>
            </Th>
            <Th col="sales" align="right">
              <span className="inline-flex items-center">
                {t("sku.col.sales")}
                <InfoTooltip text={t("sku.list.salesTip")} />
              </span>
            </Th>
            <Th col="reorder" align="right">{t("sku.col.reorderDays", { n: reorderDays })}</Th>
            <Th col="confidence" align="right" accent>
              <span className="inline-flex items-center">
                {t("sku.col.confidence")}
                <InfoTooltip text={t("sku.list.confTip")} />
              </span>
            </Th>
            <Th col="health" align="right">{t("sku.col.health")}</Th>
            <Th col="lost_revenue" align="right">
              <span className="inline-flex items-center">
                {t("sku.col.lostRevenue")}
                <InfoTooltip text={t("sku.list.lostTip")} />
              </span>
            </Th>
            <Th col="notes">{t("sku.col.notes")}</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((p: any) => {
            const m = (p.tvelo_metrics?.[0] ?? null) as any;
            const override = periodMetrics?.get(p.product_id) ?? null;

            const adjVel = override
              ? override.velocity
              : (m?.adjusted_velocity != null ? Number(m.adjusted_velocity) : 0);
            const stockoutDays = override
              ? override.stockout_days
              : (m?.stockout_days != null ? Number(m.stockout_days) : 0);
            const salesUnits = override
              ? override.sales_units
              : (salesByProduct[p.product_id] ?? 0);
            const currentStock = override
              ? override.current_stock
              : (m?.current_stock ?? null);
            const currentPrice = override
              ? override.current_price
              : (m?.current_price ?? null);
            const coverageDays = override
              ? override.coverage_days
              : (m?.coverage_days != null ? Number(m.coverage_days) : null);
            const lostRev = lostByProduct[p.product_id] ?? 0;
            const lostUnits = lostUnitsByProduct[p.product_id] ?? 0;
            const reorderQty = Math.round(adjVel * reorderDays);
            const isUnderestimated = m?.underestimated_sku;

            return (
              <tr key={p.product_id} className="hover:bg-bg-soft/50 transition">
                <td className="col-skucol-sku px-3 sm:px-4 py-3 font-mono text-xs">
                  {/* Александр 04.06.2026: артикул без гиперссылки, чёрным. */}
                  <span className="text-ink font-medium">{p.sku}</span>
                </td>
                {/* Александр 11.06.2026: бренд — отдельный столбец между SKU и Названием
                    (из API). Из ячейки названия бренд и категория убраны — остаются
                    только теги, чтобы строки не были слишком широкими. */}
                <td className="col-skucol-brand px-3 sm:px-4 py-3">
                  {p.brand ? (
                    <Link href={`/dashboard/skus?brand=${encodeURIComponent(p.brand)}` as any}
                          className="font-mono text-[11px] uppercase tracking-wider text-ink-soft hover:text-azure transition"
                          title={p.brand}>
                      {p.brand}
                    </Link>
                  ) : (
                    <span className="text-ink-hush">—</span>
                  )}
                </td>
                <td className="col-skucol-name px-3 sm:px-4 py-3">
                  {/* Название — ссылка для проваливания в карточку SKU (Александр 01.06.2026).
                      Бренд — отдельная колонка (Александр 11.06.2026). Категория (Игорь 19.06):
                      убрали чип из таблицы — он дублировал фильтр «Все категории» сверху и
                      раздувал высоту строки. Фильтровать по категории теперь только через
                      дропдаун. Под названием остаются только пользовательские теги. */}
                  <SkuLink
                    id={p.product_id}
                    name={p.product_name}
                    className="text-lime-deep hover:text-ink transition"
                  />
                  {isUnderestimated && (
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-widest text-azure font-semibold">{t("sku.list.underestimated")}</span>
                  )}
                  {p.tags && p.tags.length > 0 && (
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      {p.tags.map((tag: string) => (
                        <Link key={tag} href={`/dashboard/skus?tag=${encodeURIComponent(tag)}` as any}
                              className="inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[11px] tracking-wider border border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-400 hover:text-violet-900 transition"
                              title={tag}>
                          #{tag}
                        </Link>
                      ))}
                    </div>
                  )}
                </td>
                <td className="col-skucol-stock px-3 sm:px-4 py-3 text-right tabular text-ink-soft">{currentStock ?? "—"}</td>
                <td className="col-skucol-price px-3 sm:px-4 py-3 text-right tabular text-ink-soft">{currentPrice ?? "—"}</td>
                <td className="col-skucol-tvelo px-3 sm:px-4 py-3 text-right font-semibold tabular text-ink">
                  {adjVel > 0 ? adjVel.toFixed(2) : "—"}
                </td>
                <td className="col-skucol-trend px-3 sm:px-4 py-3"><VelocitySparkline points={sparkData[p.product_id] ?? []} /></td>
                <td className="col-skucol-coverage px-3 sm:px-4 py-3 text-right tabular text-ink-soft">
                  {coverageDays != null ? t("sku.daysShort", { n: coverageDays.toFixed(0) }) : "—"}
                </td>
                <td className="col-skucol-oos px-3 sm:px-4 py-3 text-right tabular" title={t("sku.filters.oos.hint")}>
                  {stockoutDays > 0 ? (
                    <span className="text-orange font-semibold">{stockoutDays}</span>
                  ) : (
                    <span className="text-ink-soft">0</span>
                  )}
                </td>
                <td className="col-skucol-sales px-3 sm:px-4 py-3 text-right tabular text-ink-soft" title={t("sku.list.salesTitle")}>
                  {salesUnits > 0 ? salesUnits : "—"}
                </td>
                <td className="col-skucol-reorder px-3 sm:px-4 py-3 text-right font-semibold tabular text-lime-deep">
                  {adjVel > 0 ? reorderQty : "—"}
                </td>
                <td className="col-skucol-confidence px-3 sm:px-4 py-3 text-right tabular bg-lime-soft/30">
                  {m?.confidence_score != null ? (
                    <span className="font-semibold text-ink">{Number(m.confidence_score).toFixed(0)}%</span>
                  ) : <span className="text-ink-hush">—</span>}
                </td>
                <td className="col-skucol-health px-3 sm:px-4 py-3 text-right">
                  <HealthBadge score={m?.sku_health_score} />
                </td>
                {/* Александр 01.06.2026: к сумме в ₽ добавить количество в шт в скобках */}
                <td className="col-skucol-lost_revenue px-3 sm:px-4 py-3 text-right tabular">
                  {lostRev > 0 ? (
                    <span className="text-rose font-semibold whitespace-nowrap">
                      {Math.round(lostRev).toLocaleString("ru-RU")}
                      {lostUnits > 0 && (
                        <span className="ml-1 text-rose/60 font-normal text-xs">{t("sku.list.unitsParen", { n: lostUnits })}</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-ink-hush">—</span>
                  )}
                </td>
                <td className="col-skucol-notes px-3 sm:px-4 py-3">
                  <NotesCell productId={p.product_id} initial={p.user_notes ?? null} />
                </td>
              </tr>
            );
          })}
          {!rows.length && (
            <tr>
              <td colSpan={15} className="px-3 sm:px-4 py-12 text-center text-ink-muted text-sm">
                {selectedName
                  ? t("sku.list.emptySelected", { name: selectedName })
                  : t("sku.list.emptyNone")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align = "left", accent = false, col }: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  accent?: boolean;
  col: string;
}) {
  const alignCls = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const accentCls = accent ? "bg-lime-soft/30" : "";
  return (
    <th className={`col-skucol-${col} px-3 sm:px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold whitespace-nowrap ${alignCls} ${accentCls}`}>
      {children}
    </th>
  );
}

function HealthBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-ink-hush">—</span>;
  const n = Number(score);
  if (n < 30) {
    return (
      <span className="inline-flex items-center justify-center font-semibold tabular text-rose bg-rose/10 border border-rose/30 rounded px-1.5 py-0.5 min-w-[2.5rem]">
        {n.toFixed(0)}
      </span>
    );
  }
  if (n < 70) {
    return (
      <span className="inline-flex items-center justify-center font-semibold tabular text-orange bg-orange/10 border border-orange/30 rounded px-1.5 py-0.5 min-w-[2.5rem]">
        {n.toFixed(0)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center font-semibold tabular text-lime-deep bg-lime-soft border border-lime-deep/30 rounded px-1.5 py-0.5 min-w-[2.5rem]">
      {n.toFixed(0)}
    </span>
  );
}
