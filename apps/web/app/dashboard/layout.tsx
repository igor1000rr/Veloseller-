import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AppHeader from "../_components/AppHeader";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const isAdmin = ADMIN_EMAILS.includes((user.email || "").toLowerCase());

  const { count: unreadAlerts } = await supabase
    .from("alerts")
    .select("id", { count: "exact", head: true })
    .is("acknowledged_at", null);

  return (
    <div className="min-h-screen bg-bg">
      <AppHeader
        email={user.email || ""}
        variant="dashboard"
        unreadAlerts={unreadAlerts ?? 0}
        isAdmin={isAdmin}
      />
      <main className="w-full max-w-[1600px] mx-auto px-4 md:px-8 lg:px-12 py-6 md:py-8">
        {children}
      </main>
    </div>
  );
}
