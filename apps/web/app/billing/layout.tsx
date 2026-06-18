import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AppHeader from "../_components/AppHeader";
import FreshDataGuard from "../_components/FreshDataGuard";
import { listWarehouses, getSelectedWarehouse } from "@/lib/warehouse";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ count: unreadAlerts }, { data: seller }, warehouses, selected] = await Promise.all([
    supabase.from("alerts").select("id", { count: "exact", head: true }).is("acknowledged_at", null),
    supabase.from("sellers").select("plan").eq("id", user.id).maybeSingle(),
    listWarehouses(supabase, user.id),
    getSelectedWarehouse(supabase, user.id),
  ]);

  return (
    <div className="min-h-screen bg-bg">
      <FreshDataGuard />
      <AppHeader
        email={user.email || ""}
        variant="dashboard"
        unreadAlerts={unreadAlerts ?? 0}
        plan={seller?.plan ?? "trial"}
        warehouses={warehouses}
        selectedWarehouseId={selected?.id ?? null}
      />
      <main className="w-full max-w-[1600px] mx-auto px-4 md:px-8 lg:px-12 py-6 md:py-8">
        {children}
      </main>
    </div>
  );
}
