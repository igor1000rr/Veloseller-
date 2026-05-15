import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const email = (user.email || "").toLowerCase();
  if (!ADMIN_EMAILS.includes(email)) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200">
        <div className="mx-auto max-w-7xl flex items-center justify-between px-6 h-14">
          <div className="flex items-center gap-8">
            <Link href="/admin" className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-violet-600"></span>
              <span className="text-sm font-semibold tracking-tight">Veloseller</span>
              <span className="text-xs text-slate-400 font-medium uppercase tracking-wider ml-1">admin</span>
            </Link>
            <nav className="flex gap-1 text-sm">
              <NavLink href="/admin" label="Обзор" />
              <NavLink href="/admin/sellers" label="Селлеры" />
              <NavLink href="/admin/activity" label="Активность" />
            </nav>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-500">{user.email}</span>
            <Link href="/dashboard" className="text-violet-600 hover:text-violet-700 font-medium">
              ← В личный кабинет
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href as any} className="px-3 py-1.5 rounded-md text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition">
      {label}
    </Link>
  );
}
