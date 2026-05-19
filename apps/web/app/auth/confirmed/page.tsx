import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Email подтверждён — Veloseller",
};

/**
 * Страница успеха после email confirmation.
 *
 * Доступна только залогиненным (auth/callback только что поставил cookies).
 * Если юзер прямым URL вбивает — редирект на login.
 */
export default async function ConfirmedPage() {
  const sb = await createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-paper text-ink flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-500 flex items-center justify-center">
            <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="font-display text-4xl tracking-tight">Email подтверждён</h1>
          <p className="text-ink-muted">
            Аккаунт <span className="font-mono text-ink">{user.email}</span> активирован.
            Можешь сразу подключить источник данных и начать пользоваться.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Link
            href="/onboarding"
            className="inline-flex items-center justify-center px-6 py-3 bg-ink text-paper rounded-lg font-mono uppercase tracking-wider text-sm hover:opacity-90"
          >
            Начать настройку
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center px-6 py-3 border border-line text-ink rounded-lg font-mono uppercase tracking-wider text-sm hover:bg-bg-soft"
          >
            Перейти в дашборд
          </Link>
        </div>
      </div>
    </div>
  );
}
