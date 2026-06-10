"use client";
import { useTransition } from "react";
import Link from "next/link";
import { actionApproveBrand, actionExcludeBrand, actionDeleteBrand } from "../actions";

type Brand = {
  id: string;
  name: string;
  status: "approved" | "excluded";
  source: "ai" | "manual" | "price";
  sku_count: number | null;
  avg_price: number | null;
  created_at: string;
  last_wordstat_at: string | null;
};

export default function BrandList({
  brands,
  approvedCount,
  brandsLimit,
}: {
  brands: Brand[];
  approvedCount: number;
  brandsLimit: number;
}) {
  if (brands.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-paper p-8 text-center text-sm text-ink-muted">
        Пока ни одного бренда. Загрузите прайс или добавьте бренд вручную выше.
      </div>
    );
  }

  const approved = brands.filter(b => b.status === "approved");
  const excluded = brands.filter(b => b.status === "excluded");

  // Лимит достигнут — кнопка «Восстановить» в excluded должна быть disabled
  // (баг Александра 01.06.2026: из исключённых можно было восстановить поверх лимита).
  const limitReached = approvedCount >= brandsLimit;

  return (
    <div className="space-y-6">
      <Section title="Активные" brands={approved} />
      {excluded.length > 0 && (
        <Section
          title="Исключённые"
          brands={excluded}
          muted
          restoreDisabled={limitReached}
          brandsLimit={brandsLimit}
        />
      )}
    </div>
  );
}

function Section({
  title, brands, muted, restoreDisabled, brandsLimit,
}: {
  title: string;
  brands: Brand[];
  muted?: boolean;
  restoreDisabled?: boolean;
  brandsLimit?: number;
}) {
  return (
    <div>
      <h3 className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-3">
        {title} ({brands.length})
      </h3>
      <div className="rounded-2xl border border-line bg-paper overflow-hidden">
        {brands.map((b, i) => (
          <BrandRow
            key={b.id}
            brand={b}
            muted={muted}
            last={i === brands.length - 1}
            restoreDisabled={restoreDisabled}
            brandsLimit={brandsLimit}
          />
        ))}
      </div>
    </div>
  );
}

function BrandRow({
  brand, muted, last, restoreDisabled, brandsLimit,
}: {
  brand: Brand;
  muted?: boolean;
  last: boolean;
  restoreDisabled?: boolean;
  brandsLimit?: number;
}) {
  const [pending, startTransition] = useTransition();

  const isExcluded = brand.status === "excluded";
  // Только для excluded строк, и только если лимит достигнут — блокируем
  const buttonDisabled = pending || (isExcluded && !!restoreDisabled);

  const onAction = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (buttonDisabled) return;
    startTransition(async () => {
      try {
        if (brand.status === "approved") await actionExcludeBrand(brand.id);
        else await actionApproveBrand(brand.id);
      } catch (err: any) {
        // server-side проверка лимита в actionApproveBrand даст
        // понятную ошибку — алертом, без молчаливого падения
        alert(err?.message ?? "Ошибка");
      }
    });
  };

  // Правка Александра: удалить бренд совсем (мусор от ИИ или больше не возим).
  // Деструктивно (CASCADE на запросы) — подтверждаем.
  const onDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    if (!window.confirm(`Удалить бренд «${brand.name}» и все его сигналы? Действие необратимо.`)) return;
    startTransition(async () => {
      try {
        await actionDeleteBrand(brand.id);
      } catch (err: any) {
        alert(err?.message ?? "Ошибка");
      }
    });
  };

  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-3 ${!last ? "border-b border-line" : ""} ${muted ? "opacity-60" : ""} hover:bg-bg-soft/40 transition`}>
      <Link
        href={`/dashboard/radar/brands/${brand.id}` as any}
        className="flex items-center gap-3 min-w-0 flex-1 group"
      >
        {/* line-through убран по правкам Александра 01.06.2026 —
            достаточно opacity-60 на родителе чтобы выглядело "неактивно" */}
        <span className={`font-medium ${muted ? "text-ink-muted" : "text-ink group-hover:text-lime-deep"} truncate transition`}>
          {brand.name}
        </span>
        <span className={`font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
          brand.source === "manual" ? "bg-bg-soft text-ink-hush" : "bg-azure/10 text-azure"
        }`}>
          {brand.source === "manual" ? "manual" : brand.source === "price" ? "прайс" : "ai"}
        </span>
        {brand.sku_count != null && brand.sku_count > 0 && (
          <span className="font-mono text-[10px] text-ink-hush">
            {brand.sku_count} SKU
          </span>
        )}
        <span className="font-mono text-[10px] text-ink-hush group-hover:text-lime-deep transition ml-auto pr-2">
          →
        </span>
      </Link>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onAction}
          disabled={buttonDisabled}
          title={isExcluded && restoreDisabled
            ? `Лимит исчерпан (${brandsLimit ?? 0} брендов). Исключите другой бренд или перейдите на старший тариф.`
            : undefined}
          className={`text-xs font-mono uppercase tracking-wider px-3 py-1.5 rounded transition disabled:opacity-40 disabled:cursor-not-allowed ${
            brand.status === "approved"
              ? "text-ink-muted hover:text-orange border border-line hover:border-orange/40"
              : "text-lime-deep border border-lime-deep/40 hover:bg-lime-soft"
          }`}
        >
          {brand.status === "approved" ? "Исключить" : "Восстановить"}
        </button>
        <button
          onClick={onDelete}
          disabled={pending}
          title="Удалить бренд и все его сигналы"
          className="text-xs font-mono uppercase tracking-wider px-3 py-1.5 rounded transition disabled:opacity-40 text-ink-muted hover:text-rose border border-line hover:border-rose/40"
        >
          Удалить
        </button>
      </div>
    </div>
  );
}
