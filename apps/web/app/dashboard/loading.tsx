/**
 * Skeleton для /dashboard — показывается Next.js автоматически пока RSC рендерится.
 *
 * Когда срабатывает:
 * - Переход с любой страницы (главная, /skus, /dynamics) на /dashboard
 * - Файл лежит в /dashboard поэтому покрывает и /dashboard/skus, /dashboard/dynamics
 *   и т.д. (Next.js берёт ближайший loading.tsx вверх по дереву)
 *
 * Дизайн повторяет структуру dashboard/page.tsx (полосы KPI):
 *  1. Хедер: pill «Inventory» + title
 *  2. Полоса 1 — 3 средних KPI (низкий остаток / потерянная выручка / неликвид)
 *  3. Полоса 2 — большой блок health + 2 блока денег
 *  4. Полоса 3 — 4 маленьких KPI (всего SKU / нет в наличии / inactive / ДСТ)
 *  5. Полоса 4 — 3 средних блока (концентрации + frequently_oos)
 *
 * Анимация: animate-pulse даёт «дышащий» эффект серых плашек.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-live="polite">
      <span className="sr-only">Загружаем данные…</span>

      {/* Хедер */}
      <header>
        <div className="flex items-center gap-2 mb-2">
          <span className="size-1 rounded-full bg-lime-deep" />
          <span className="h-3 w-20 bg-lime-soft rounded" />
        </div>
        <div className="h-8 w-48 bg-bg-soft rounded-lg" />
      </header>

      {/* Полоса 1 — 3 KPI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
        <KpiSkeleton tone="default" />
        <KpiSkeleton tone="danger" />
        <KpiSkeleton tone="default" />
      </div>

      {/* Полоса 2 — Health (большой) + 2 блока денег */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <div className="lg:col-span-1 rounded-2xl border border-line bg-paper p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-3 w-32 bg-bg-soft rounded" />
            <div className="h-5 w-16 bg-lime-soft rounded" />
          </div>
          <div className="h-14 w-32 bg-bg-soft rounded-lg" />
          <div className="h-2 bg-bg-soft rounded-full" />
          <div className="h-3 w-48 bg-bg-soft rounded" />
        </div>
        <KpiSkeleton tone="default" tall />
        <KpiSkeleton tone="default" tall />
      </div>

      {/* Полоса 3 — 4 маленьких KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <SmallKpiSkeleton />
        <SmallKpiSkeleton />
        <SmallKpiSkeleton />
        <SmallKpiSkeleton />
      </div>

      {/* Полоса 4 — 3 средних блока */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
        <KpiSkeleton tone="default" />
        <KpiSkeleton tone="default" />
        <KpiSkeleton tone="default" />
      </div>

      {/* Полоса 5 — графики / таблицы (заглушка) */}
      <div className="rounded-2xl border border-line bg-paper p-4 sm:p-6 space-y-3">
        <div className="h-4 w-40 bg-bg-soft rounded" />
        <div className="h-48 bg-bg-soft/60 rounded-lg" />
      </div>
    </div>
  );
}

/* ─── Подкомпоненты ──────────────────────────────────────────────────── */

function KpiSkeleton({ tone, tall = false }: { tone: "default" | "danger"; tall?: boolean }) {
  return (
    <div className={`rounded-2xl border border-line bg-paper p-4 sm:p-5 space-y-3 ${tall ? "min-h-[180px]" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="h-3 w-24 bg-bg-soft rounded" />
        <div className="size-3 rounded-full bg-bg-soft" />
      </div>
      <div className={`${tone === "danger" ? "bg-rose/10" : "bg-bg-soft"} h-10 w-20 rounded-lg`} />
      <div className="h-3 w-40 bg-bg-soft/70 rounded" />
    </div>
  );
}

function SmallKpiSkeleton() {
  return (
    <div className="rounded-2xl border border-line bg-paper p-3 sm:p-4 space-y-2">
      <div className="h-3 w-20 bg-bg-soft rounded" />
      <div className="h-8 w-16 bg-bg-soft rounded-lg" />
    </div>
  );
}
