import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AppHeader from "../_components/AppHeader";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { count: unreadAlerts } = await supabase
    .from("alerts")
    .select("id", { count: "exact", head: true })
    .is("acknowledged_at", null);

  return (
    <div className="min-h-screen bg-bg">
      <AppHeader email={user.email || ""} variant="dashboard" unreadAlerts={unreadAlerts ?? 0} />
      <main className="w-full max-w-[1600px] mx-auto px-4 md:px-8 lg:px-12 py-6 md:py-8">
        {children}
      </main>
    </div>
  );
}
