import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import BrandList from "./BrandList";
import AddBrandForm from "./AddBrandForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RadarBrandsPage() {
  const sb = await createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: brands }, { data: seller }] = await Promise.all([
    sb.from("radar_brands")
      .select("id, name, status, source, sku_count, avg_price, created_at, last_wordstat_at")
      .eq("seller_id", user.id)
      .order("status", { ascending: true })
      .order("name"),
    sb.from("sellers")
      .select("radar_plan, radar_brands_limit")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const approvedCount = (brands ?? []).filter(b => b.status === "approved").length;
  const limit = seller?.radar_brands_limit ?? 0;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href={"/dashboard/radar"} className="text-xs font-mono uppercase tracking-wider text-ink-hush hover:text-ink transition mb-2 inline-block">
            ← К списку сигналов
          </Link>
          <h1 className="font-display text-2xl md:text-3xl font-medium text-ink">Бренды Radar</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Подтверждённых: {approvedCount} из {limit}. Тариф {seller?.radar_plan ?? "none"}.
          </p>
        </div>
      </div>

      <AddBrandForm limitReached={approvedCount >= limit} />
      <BrandList
        brands={brands ?? []}
        approvedCount={approvedCount}
        brandsLimit={limit}
      />
    </div>
  );
}
