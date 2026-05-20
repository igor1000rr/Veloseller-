import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AccountActions } from "./AccountActions";
import { NotificationSettings } from "./NotificationSettings";

export const metadata = {
  title: "Аккаунт — Veloseller",
};

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const sb = await createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login?redirect=/account");

  // Подгружаем настройки уведомлений и часовой пояс
  const { data: seller } = await sb
    .from("sellers")
    .select("timezone, notify_email, notify_telegram")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
          <Link href="/dashboard" className="font-display text-xl tracking-tight">Veloseller</Link>
          <nav className="flex gap-6 text-sm font-mono uppercase tracking-wider text-ink-hush">
            <Link href="/dashboard" className="hover:text-ink">Дашборд</Link>
            <Link href="/billing" className="hover:text-ink">Тарифы</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
        <section>
          <h1 className="font-display text-4xl tracking-tight">Настройки</h1>
          <p className="mt-2 text-ink-hush">Уведомления, часовой пояс и управление данными</p>
        </section>

        <section className="rounded-2xl border border-line bg-paper p-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold mb-2">
            Email
          </div>
          <div className="text-xl">{user.email}</div>
          <div className="mt-1 text-sm text-ink-hush">ID: {user.id}</div>
        </section>

        <NotificationSettings
          initial={{
            timezone: seller?.timezone || "Europe/Moscow",
            notifyEmail: seller?.notify_email ?? true,
            notifyTelegram: seller?.notify_telegram ?? false,
            sellerId: user.id,
          }}
        />

        <AccountActions />

        <section className="text-sm text-ink-muted space-y-2">
          <p>
            <strong>Экспорт данных</strong> (GDPR Article 20): получите все ваши данные в JSON-формате.
            Включает профиль, продукты, метрики, события и алерты. API-ключи маркетплейсов в экспорт не входят.
          </p>
          <p>
            <strong>Удаление аккаунта</strong> (GDPR Article 17): необратимо удаляет все данные.
            Резервные копии стираются в течение 30 дней. Биллинг-записи сохраняются 7 лет
            (требование налогового законодательства).
          </p>
        </section>
      </main>
    </div>
  );
}
