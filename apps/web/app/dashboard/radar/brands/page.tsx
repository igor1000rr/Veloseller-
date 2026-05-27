import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BrandsList } from "./BrandsList";
import { AddBrandForm } from "./AddBrandForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BrandsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: seller } = await supabase
    .from("sellers")
    .select("radar_plan,radar_brands_limit")
    .eq("id", user.id)
    .maybeSingle();

  const radarPlan = (seller as any)?.radar_plan ?? "none";
  const brandsLimit = (seller as any)?.radar_brands_limit ?? 0;

  if (radarPlan === "none") {
    redirect("/dashboard/radar");
  }

  const { data: brands } = await supabase
    .from("radar_brands")
    .select("id,name,status,source,sku_count,avg_price,last_wordstat_at,created_at")
    .eq("seller_id", user.id)
    .order("sku_count", { ascending: false });

  const approvedCount = (brands ?? []).filter((b: any) => b.status === "approved").length;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <Link
            href={"/dashboard/radar" as any}
            className="font-mono text-[11px] uppercase tracking-wider text-ink-hush hover:text-ink transition mb-2 inline-block"
          >
            ← Назад в Radar
          </Link>
          <h1 className="font-display text-2xl sm:text-3xl font-medium tracking-tight text-ink">
            Бренды
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            Используется {approvedCount} из {brandsLimit} брендов вашего тарифа
          </p>
        </div>
      </div>

      <AddBrandForm
        canAdd={approvedCount < brandsLimit}
        brandsLeft={brandsLimit - approvedCount}
      />

      <BrandsList brands={brands ?? []} />
    </div>
  );
}
