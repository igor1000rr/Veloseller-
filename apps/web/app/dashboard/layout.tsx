import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import LogoutButton from "./LogoutButton";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { count: unreadAlerts } = await supabase
    .from("alerts")
    .select("id", { count: "exact", head: true })
    .is("acknowledged_at", null);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-lg font-bold text-brand-700">
              Veloseller
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/dashboard" className="text-slate-700 hover:text-brand-700">Обзор</Link>
              <Link href="/dashboard/skus" className="text-slate-700 hover:text-brand-700">SKU</Link>
              <Link href="/dashboard/alerts" className="text-slate-700 hover:text-brand-700 relative">
                Уведомления
                {unreadAlerts && unreadAlerts > 0 ? (
                  <span className="ml-1 inline-flex items-center justify-center px-1.5 h-4 text-xs font-medium bg-red-100 text-red-700 rounded">
                    {unreadAlerts}
                  </span>
                ) : null}
              </Link>
              <Link href="/dashboard/changelog" className="text-slate-700 hover:text-brand-700">Журнал</Link>
              <Link href="/dashboard/dynamics" className="text-slate-700 hover:text-brand-700">Динамика</Link>
              <Link href="/connections" className="text-slate-700 hover:text-brand-700">Источники</Link>
              <Link href="/dashboard/settings" className="text-slate-700 hover:text-brand-700">Настройки</Link>
              <Link href="/billing" className="text-slate-700 hover:text-brand-700">Тариф</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-600">{user.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
