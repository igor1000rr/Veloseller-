import { createSupabaseServerClient } from "@/lib/supabase/server";
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

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "";
  const deeplinkUrl = botUsername ? `https://t.me/${botUsername}?start=${user.id}` : null;

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <div className="inline-flex items-center gap-2 mb-2">
          <span className="size-1 rounded-full bg-lime-deep" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">Settings</span>
        </div>
        <h1 className="font-display text-3xl md:text-4xl tracking-tight font-medium text-ink">Настройки</h1>
        <p className="mt-1 text-ink-muted text-sm">Профиль и уведомления</p>
      </header>
      <SettingsForm initial={seller ?? {}} telegramDeeplink={deeplinkUrl} />
    </div>
  );
}
