import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AppHeader from "../_components/AppHeader";

// Свежие данные на каждый запрос
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const email = (user.email || "").toLowerCase();
  if (!ADMIN_EMAILS.includes(email)) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-bg">
      <AppHeader email={user.email || ""} variant="admin" />
      <main className="w-full max-w-[1600px] mx-auto px-4 md:px-8 lg:px-12 py-6 md:py-8">
        {children}
      </main>
    </div>
  );
}
