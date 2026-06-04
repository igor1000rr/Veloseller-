import { t } from "@/lib/i18n";

/**
 * Хелперы для построения breakdown — переиспользуются между Health и Confidence.
 *
 * ВАЖНО: файл сознательно БЕЗ "use client". Эти функции вызываются в
 * СЕРВЕРНОМ компоненте карточки ([id]/page.tsx). Раньше они жили в
 * HealthTooltip.tsx с директивой "use client" — Next 15 превращает экспорты
 * такого модуля в client references, и вызов на сервере кидает
 * "Attempted to call buildHealthBreakdown() from the server but ... is on the
 * client" — именно это роняло карточку SKU в проде (digest 801888437).
 * Не переносить обратно в client-модуль.
 */

export type BreakdownRow = { label: string; value: string; tone?: "bad" | "warn" | "neutral" };

export function buildHealthBreakdown(m: any): BreakdownRow[] {
  if (!m) return [];
  const rows: BreakdownRow[] = [];
  const periodDays = Number(m.in_stock_days ?? 0) + Number(m.stockout_days ?? 0);
  if (m.stockout_days != null && m.stockout_days > 0 && periodDays > 0) {
    const penalty = Math.min(40, (Number(m.stockout_days) / periodDays) * 40);
    rows.push({ label: t("sku.health.bd.stockout", { days: m.stockout_days, period: periodDays }), value: `−${penalty.toFixed(1)}`, tone: "bad" });
  }
  if (m.coverage_days != null && Number(m.coverage_days) <= 7) {
    const cov = Number(m.coverage_days);
    const penalty = Math.max(0, ((7 - cov) / 7) * 25);
    rows.push({ label: t("sku.health.bd.lowCoverage", { days: cov.toFixed(0) }), value: `−${penalty.toFixed(1)}`, tone: "warn" });
  }
  if (m.coverage_days != null && Number(m.coverage_days) > 180) {
    const cov = Number(m.coverage_days);
    const penalty = Math.min(25, ((cov - 180) / 180) * 25);
    rows.push({ label: t("sku.health.bd.illiquid", { days: cov.toFixed(0) }), value: `−${penalty.toFixed(1)}`, tone: "warn" });
  }
  if (m.confidence_score != null) {
    const conf = Number(m.confidence_score);
    const penalty = (100 - conf) * 0.2;
    if (penalty > 0) {
      rows.push({ label: t("sku.health.bd.confidence", { pct: conf.toFixed(0) }), value: `−${penalty.toFixed(1)}`, tone: "neutral" });
    }
  }
  if (rows.length === 0) {
    rows.push({ label: t("sku.health.bd.allGood"), value: "0", tone: "neutral" });
  }
  return rows;
}

/**
 * Confidence breakdown из tvelo_metrics.confidence_breakdown JSON.
 *
 * БАГ FIX: раньше использовались ключи `*_penalty` — таких полей в JSON нет, hover показывал
 * только "Все события чистые". Реальные ключи (из app/schemas.py:ConfidenceBreakdown):
 *   replenishment_like, anomaly_like, missing_data, low_history, initial, final
 *
 * Каждое значение — это уже процент штрафа (например repl=14.29 = -14.29% от initial).
 */
export function buildConfidenceBreakdown(m: any): BreakdownRow[] {
  const cb = m?.confidence_breakdown;
  if (!cb || typeof cb !== "object") return [];
  const rows: BreakdownRow[] = [];
  const labels: Array<[string, string]> = [
    ["replenishment_like", t("sku.conf.replenishment")],
    ["anomaly_like",       t("sku.conf.anomaly")],
    ["missing_data",       t("sku.conf.missingData")],
    ["low_history",        t("sku.conf.lowHistory")],
  ];
  for (const [key, label] of labels) {
    const v = Number(cb[key] ?? 0);
    if (v > 0) {
      rows.push({ label, value: `−${v.toFixed(1)}%`, tone: "warn" });
    }
  }
  if (rows.length === 0) rows.push({ label: t("sku.conf.allClean"), value: "0%", tone: "neutral" });
  return rows;
}
