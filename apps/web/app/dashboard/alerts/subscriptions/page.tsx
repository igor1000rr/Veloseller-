import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Icons } from "../../../_components/Icons";
import { InfoTooltip } from "../../../_components/InfoTooltip";
import { SubscriptionsList, type Subscription } from "./SubscriptionsList";

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
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">
            Reports
          </span>
        </div>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-2xl sm:text-3xl md:text-4xl tracking-tight font-medium text-ink flex items-center flex-wrap">
              <span>Настройка отчётов</span>
              <InfoTooltip text="Здесь вы выбираете какие Excel-отчёты присылать, в какой день недели и как часто (еженедельно или ежемесячно). Если несколько отчётов на один день — придёт один файл с разными листами." />
            </h1>
            <p className="text-sm text-ink-muted mt-1">
              Каждый отчёт можно включить, изменить пороги, день отправки и частоту, или совсем удалить.
              Приходит одним файлом Excel со списком SKU — не засоряет почту по каждому товару.
            </p>
          </div>
          <Link
            href={"/dashboard/alerts" as any}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-line bg-paper text-sm text-ink-muted hover:text-ink hover:bg-bg-soft transition shrink-0 min-h-[36px]"
          >
            <span className="rotate-180"><Icons.ArrowRight size={11} /></span> К отчётам
          </Link>
        </div>
      </header>

      <SubscriptionsList subscriptions={subscriptions} />

      <div className="rounded-xl border border-azure/30 bg-azure/5 p-3 sm:p-4">
        <h3 className="font-display text-sm font-medium text-ink mb-2">
          О каналах доставки
        </h3>
        <ul className="text-sm text-ink-muted space-y-1.5">
          <li>
            <b className="text-ink">Email</b> — приходит на адрес, указанный в профиле.
            Можно поменять в <Link href={"/account" as any} className="text-lime-deep hover:underline">настройках аккаунта</Link>.
          </li>
          <li>
            <b className="text-ink">Telegram</b> — нужно привязать чат-бота через
            <Link href={"/account" as any} className="text-lime-deep hover:underline ml-1">профиль</Link>.
            Если не привязано — отчёты молча не доходят.
          </li>
        </ul>
        <p className="mt-3 text-xs text-ink-hush break-words">
          Письма приходят с <code className="bg-paper px-1.5 py-0.5 rounded text-ink-soft">noreply@veloseller.ru</code>.
          Если не видите — проверьте папку «Спам».
        </p>
      </div>
    </div>
  );
}
