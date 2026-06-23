import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signTelegramLinkToken } from "@/lib/telegram-link";
import { t } from "@/lib/i18n";
import SettingsForm from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: seller } = await supabase
    .from("sellers")
    .select("display_name,timezone,telegram_chat_id,notify_email,notify_telegram")
    .eq("id", user.id)
    .single();

  // Deep-link c ПОДПИСАННЫМ токеном (не сырой UUID) — закрывает hijack привязки.
  // Нет бота/секрета → null → SettingsForm покажет ручной ввод Chat ID.
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "";
  const linkToken = signTelegramLinkToken(user.id);
  const deeplinkUrl = botUsername && linkToken ? `https://t.me/${botUsername}?start=${linkToken}` : null;

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <div className="inline-flex items-center gap-2 mb-2">
          <span className="size-1 rounded-full bg-lime-deep" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">{t("settings.kicker")}</span>
        </div>
        <h1 className="font-display text-3xl md:text-4xl tracking-tight font-medium text-ink">{t("settings.title")}</h1>
        <p className="mt-1 text-ink-muted text-sm">{t("settings.subtitle")}</p>
      </header>
      <SettingsForm initial={seller ?? {}} telegramDeeplink={deeplinkUrl} email={user.email} />
    </div>
  );
}
