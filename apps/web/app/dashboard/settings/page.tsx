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
    <div className="max-w-2xl space-y-8">
      <h1 className="text-3xl font-bold text-slate-900">Настройки</h1>
      <SettingsForm initial={seller ?? {}} telegramDeeplink={deeplinkUrl} />
    </div>
  );
}
