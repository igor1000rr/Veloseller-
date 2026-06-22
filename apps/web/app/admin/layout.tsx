import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth";
import AppHeader from "../_components/AppHeader";
import FreshDataGuard from "../_components/FreshDataGuard";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// Приватный раздел — noindex (defense-in-depth к robots.txt: robots запрещает
// краул, но URL может попасть в индекс по бэклинку; noindex закрывает и это).
export const metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isAdminEmail(user.email)) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-bg">
      <FreshDataGuard />
      <AppHeader email={user.email || ""} variant="admin" />
      <main className="w-full max-w-[1600px] mx-auto px-4 md:px-8 lg:px-12 py-6 md:py-8">
        {children}
      </main>
    </div>
  );
}
