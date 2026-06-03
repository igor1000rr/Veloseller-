import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AccountActions } from "./AccountActions";
import { NotificationSettings } from "./NotificationSettings";
import { t } from "@/lib/i18n";

export const metadata = {
  title: t("account.metaTitle"),
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
            <Link href="/dashboard" className="hover:text-ink">{t("account.nav.dashboard")}</Link>
            <Link href="/billing" className="hover:text-ink">{t("account.nav.billing")}</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
        <section>
          <h1 className="font-display text-4xl tracking-tight">{t("account.title")}</h1>
          <p className="mt-2 text-ink-hush">{t("account.subtitle")}</p>
        </section>

        <section className="rounded-2xl border border-line bg-paper p-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold mb-2">{t("account.emailLabel")}</div>
          <div className="text-xl">{user.email}</div>
          <div className="mt-1 text-sm text-ink-hush">{t("account.idPrefix")} {user.id}</div>
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
            <strong>{t("account.gdpr.exportLabel")}</strong> {t("account.gdpr.exportDesc")}
          </p>
          <p>
            <strong>{t("account.gdpr.deleteLabel")}</strong> {t("account.gdpr.deleteDesc")}
          </p>
        </section>
      </main>
    </div>
  );
}
