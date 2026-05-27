"use client";
import { useState } from "react";

type Brand = {
  id: string;
  name: string;
  status: string;
  source: string;
  sku_count: number;
  avg_price: number | null;
  last_wordstat_at: string | null;
  created_at: string;
};

export function BrandsList({ brands }: { brands: Brand[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (brands.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-paper p-8 text-center text-ink-muted">
        Пока нет брендов. Добавьте первый бренд выше — или загрузите прайс на странице Radar.
      </div>
    );
  }

  async function toggleStatus(brandId: string, newStatus: "approved" | "excluded") {
    setPendingId(brandId);
    try {
      const res = await fetch(`/api/radar/brands/${brandId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Не удалось обновить бренд");
      }
    } catch (e) {
      alert("Ошибка соединения");
    } finally {
      setPendingId(null);
    }
  }

  async function deleteBrand(brandId: string) {
    if (!confirm("Удалить бренд и все его запросы из истории? Это действие необратимо.")) return;
    setPendingId(brandId);
    try {
      const res = await fetch(`/api/radar/brands/${brandId}`, { method: "DELETE" });
      if (res.ok) {
        window.location.reload();
      } else {
        alert("Не удалось удалить");
      }
    } catch (e) {
      alert("Ошибка соединения");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-paper overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-bg-soft border-b border-line">
          <tr>
            <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Бренд</th>
            <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">SKU</th>
            <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Ср. цена</th>
            <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Источник</th>
            <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Последний опрос</th>
            <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Действия</th>
          </tr>
        </thead>
        <tbody>
          {brands.map((b) => {
            const isApproved = b.status === "approved";
            const lastDays = b.last_wordstat_at
              ? Math.floor((Date.now() - new Date(b.last_wordstat_at).getTime()) / 86400000)
              : null;
            return (
              <tr key={b.id} className={`border-b border-line last:border-0 transition ${
                isApproved ? "hover:bg-bg-soft/40" : "opacity-50 hover:opacity-80"
              }`}>
                <td className="px-4 py-3">
                  <span className="font-medium text-ink">{b.name}</span>
                  {!isApproved && <span className="ml-2 font-mono text-[10px] text-ink-hush uppercase">исключён</span>}
                </td>
                <td className="px-4 py-3 text-right tabular text-ink-muted">{b.sku_count || "—"}</td>
                <td className="px-4 py-3 text-right tabular text-ink-muted">
                  {b.avg_price ? `${Math.round(b.avg_price).toLocaleString("ru-RU")} ₽` : "—"}
                </td>
                <td className="px-4 py-3 text-ink-muted text-xs">
                  {b.source === "ai" ? "ИИ из прайса" : "вручную"}
                </td>
                <td className="px-4 py-3 text-ink-muted text-xs">
                  {lastDays == null ? "никогда" : lastDays === 0 ? "сегодня" : `${lastDays} дн назад`}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button
                    onClick={() => toggleStatus(b.id, isApproved ? "excluded" : "approved")}
                    disabled={pendingId === b.id}
                    className={`text-xs font-mono uppercase tracking-wider mr-3 ${
                      isApproved ? "text-ink-hush hover:text-rose" : "text-lime-deep hover:underline"
                    }`}
                  >
                    {isApproved ? "исключить" : "включить"}
                  </button>
                  <button
                    onClick={() => deleteBrand(b.id)}
                    disabled={pendingId === b.id}
                    className="text-xs font-mono uppercase tracking-wider text-ink-hush hover:text-rose"
                  >
                    удалить
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
