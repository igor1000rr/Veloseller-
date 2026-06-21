import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Icons } from "../../../_components/Icons";
import { InfoTooltip } from "../../../_components/InfoTooltip";
import { SubscriptionsList, type Subscription } from "./SubscriptionsList";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SubscriptionsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: subs } = await supabase
    .from("notification_subscriptions")
    .select("id,kind,channel,enabled,params,frequency,created_at")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: true });

  const subscriptions = (subs ?? []) as Subscription[];

  return (
    <div className="space-y-6">
      <header>
        <div className="inline-flex items-center gap-2 mb-2">
          <span className="size-1 rounded-full bg-lime-deep" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">{t("subs.eyebrow")}</span>
        </div>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-2xl sm:text-3xl md:text-4xl tracking-tight font-medium text-ink flex items-center flex-wrap">
              <span>{t("subs.title")}</span>
              <InfoTooltip text={t("subs.titleTip")} />
            </h1>
            <p className="text-sm text-ink-muted mt-1">{t("subs.subtitle")}</p>
          </div>
          <Link
            href={"/dashboard/alerts"}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-line bg-paper text-sm text-ink-muted hover:text-ink hover:bg-bg-soft transition shrink-0 min-h-[36px]"
          >
            <span className="rotate-180"><Icons.ArrowRight size={11} /></span> {t("subs.backToReports")}
          </Link>
        </div>
      </header>

      <SubscriptionsList subscriptions={subscriptions} />

      <div className="rounded-xl border border-azure/30 bg-azure/5 p-3 sm:p-4">
        <h3 className="font-display text-sm font-medium text-ink mb-2">{t("subs.channels.title")}</h3>
        <ul className="text-sm text-ink-muted space-y-1.5">
          <li>
            <b className="text-ink">Email</b> {t("subs.channels.emailText")} <Link href={"/account"} className="text-lime-deep hover:underline">{t("subs.channels.emailLink")}</Link>.
          </li>
          <li>
            <b className="text-ink">Telegram</b> {t("subs.channels.tgText")}
            <Link href={"/account"} className="text-lime-deep hover:underline ml-1">{t("subs.channels.tgLink")}</Link>. {t("subs.channels.tgWarn")}
          </li>
        </ul>
        <p className="mt-3 text-xs text-ink-hush break-words">
          {t("subs.channels.fromText")} <code className="bg-paper px-1.5 py-0.5 rounded text-ink-soft">noreply@veloseller.ru</code>. {t("subs.channels.spamHint")}
        </p>
      </div>
    </div>
  );
}
