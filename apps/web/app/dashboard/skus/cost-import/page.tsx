import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listWarehouses, getSelectedWarehouse, warehouseKindLabel } from "@/lib/warehouse";
import { CostImportForm } from "./CostImportForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CostImportPage() {
  const sb = await createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const warehouses = await listWarehouses(sb, user.id);
  const selected = await getSelectedWarehouse(sb, user.id);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href={"/dashboard/skus" as any} className="text-xs font-mono uppercase tracking-wider text-ink-hush hover:text-ink transition mb-2 inline-block">
          ← К SKU
        </Link>
        <h1 className="font-display text-2xl md:text-3xl font-medium text-ink">Добавить себестоимость</h1>
        <p className="mt-1 text-sm text-ink-muted max-w-xl">
          Загрузите CSV или XLSX — сопоставим товары по артикулу в пределах выбранного
          склада и проставим себестоимость в карточки.
        </p>
      </div>

      {warehouses.length === 0 ? (
        <div className="rounded-xl border border-orange/30 bg-orange/5 p-4 text-sm">
          <div className="font-medium text-ink">Нет складов</div>
          <p className="mt-1 text-ink-muted">
            Сначала{" "}
            <Link href={"/connections/new" as any} className="text-lime-deep underline hover:no-underline">
              подключите склад
            </Link>.
          </p>
        </div>
      ) : (
        <CostImportForm
          warehouses={warehouses.map((w) => ({
            id: w.id,
            name: w.name,
            kindLabel: warehouseKindLabel(w.warehouse_kind),
          }))}
          defaultWarehouseId={selected?.id ?? warehouses[0].id}
        />
      )}
    </div>
  );
}
