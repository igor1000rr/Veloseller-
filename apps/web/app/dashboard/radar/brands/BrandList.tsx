"use client";
import { useTransition } from "react";
import Link from "next/link";
import { actionApproveBrand, actionExcludeBrand } from "../actions";

type Brand = {
  id: string;
  name: string;
  status: "approved" | "excluded";
  source: "ai" | "manual";
  sku_count: number | null;
  avg_price: number | null;
  created_at: string;
  last_wordstat_at: string | null;
};

export default function BrandList({ brands }: { brands: Brand[] }) {
  if (brands.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-paper p-8 text-center text-sm text-ink-muted">
        Пока ни одного бренда. Загрузите прайс или добавьте бренд руками выше.
      </div>
    );
  }

  const approved = brands.filter(b => b.status === "approved");
  const excluded = brands.filter(b => b.status === "excluded");

  return (
    <div className="space-y-6">
      <Section title="Активные" brands={approved} />
      {excluded.length > 0 && <Section title="Исключённые" brands={excluded} muted />}
    </div>
  );
}

function Section({ title, brands, muted }: { title: string; brands: Brand[]; muted?: boolean }) {
  return (
    <div>
      <h3 className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-3">
        {title} ({brands.length})
      </h3>
      <div className="rounded-2xl border border-line bg-paper overflow-hidden">
        {brands.map((b, i) => (
          <BrandRow key={b.id} brand={b} muted={muted} last={i === brands.length - 1} />
        ))}
      </div>
    </div>
  );
}

function BrandRow({ brand, muted, last }: { brand: Brand; muted?: boolean; last: boolean }) {
  const [pending, startTransition] = useTransition();

  const onAction = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      if (brand.status === "approved") await actionExcludeBrand(brand.id);
      else await actionApproveBrand(brand.id);
    });
  };

  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-3 ${!last ? "border-b border-line" : ""} ${muted ? "opacity-60" : ""} hover:bg-bg-soft/40 transition`}>
      <Link
        href={`/dashboard/radar/brands/${brand.id}` as any}
        className="flex items-center gap-3 min-w-0 flex-1 group"
      >
        <span className={`font-medium ${muted ? "text-ink-muted line-through" : "text-ink group-hover:text-lime-deep"} truncate transition`}>
          {brand.name}
        </span>
        <span className={`font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
          brand.source === "ai" ? "bg-azure/10 text-azure" : "bg-bg-soft text-ink-hush"
        }`}>
          {brand.source === "ai" ? "ai" : "manual"}
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
      <button
        onClick={onAction}
        disabled={pending}
        className={`text-xs font-mono uppercase tracking-wider px-3 py-1.5 rounded transition ${
          brand.status === "approved"
            ? "text-ink-muted hover:text-orange border border-line hover:border-orange/40"
            : "text-lime-deep border border-lime-deep/40 hover:bg-lime-soft"
        }`}
      >
        {brand.status === "approved" ? "Исключить" : "Восстановить"}
      </button>
    </div>
  );
}
