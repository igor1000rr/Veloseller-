import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Icons } from "../_components/Icons";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { count: connectionsCount } = await supabase
    .from("data_connections").select("id", { count: "exact", head: true }).eq("seller_id", user.id);
  const { count: snapshotsCount } = await supabase
    .from("inventory_snapshots").select("snapshot_id", { count: "exact", head: true });
  const { count: metricsCount } = await supabase
    .from("tvelo_metrics").select("id", { count: "exact", head: true });

  const step1Done = (connectionsCount ?? 0) > 0;
  const step2Done = (snapshotsCount ?? 0) > 0;
  const step3Done = (metricsCount ?? 0) > 0;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="inline-flex items-center gap-2 mb-2">
        <span className="size-1 rounded-full bg-lime-deep" />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">{t("onboarding.kicker")}</span>
      </div>
      <h1 className="font-display text-3xl md:text-4xl tracking-tight font-medium text-ink">
        {t("onboarding.welcome")} <span className="text-lime-deep italic">Veloseller</span>
      </h1>
      <p className="mt-2 text-ink-muted text-sm">{t("onboarding.stepsCount")}</p>

      {/* Правка Александра: текст обращения на «вы», уточнение про email отчёты (текст в onboarding.warmup) */}
      <div className="mt-5 p-4 rounded-2xl border border-line bg-bg-soft text-sm text-ink-soft leading-relaxed">
        {t("onboarding.warmup")}
      </div>

      <ol className="mt-8 space-y-3">
        <Step
          n={1}
          title={t("onboarding.step1.title")}
          done={step1Done}
          description={t("onboarding.step1.desc")}
          cta={!step1Done ? { href: "/connections/new", label: t("onboarding.step1.cta") } : null}
        />
        <Step
          n={2}
          title={t("onboarding.step2.title")}
          done={step2Done}
          description={t("onboarding.step2.desc")}
          cta={step1Done && !step2Done ? { href: "/connections", label: t("onboarding.step2.cta") } : null}
        />
        <Step
          n={3}
          title={t("onboarding.step3.title")}
          done={step3Done}
          description={t("onboarding.step3.desc")}
          cta={step2Done && !step3Done ? { href: "/dashboard", label: t("onboarding.step3.cta") } : null}
        />
      </ol>

      {step1Done && step2Done && step3Done && (
        <div className="mt-8 p-6 rounded-2xl border-2 border-lime-deep/40 bg-lime-soft text-center">
          <p className="font-display text-lg text-ink font-medium mb-3">
            {t("onboarding.doneTitle")}
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 bg-ink text-paper px-6 py-3 rounded-lg font-semibold hover:bg-ink-soft transition"
          >
            {t("onboarding.step3.cta")} <Icons.ArrowRight />
          </Link>
        </div>
      )}
    </div>
  );
}

function Step({ n, title, done, description, cta }: {
  n: number; title: string; done: boolean; description: string;
  cta: { href: string; label: string } | null;
}) {
  return (
    <li
      className={`flex gap-4 p-5 rounded-2xl border ${
        done ? "bg-lime-soft border-lime-deep/30" : "bg-paper border-line"
      }`}
    >
      <div
        className={`shrink-0 size-10 rounded-full flex items-center justify-center font-display font-medium ${
          done ? "bg-lime-deep text-paper" : "bg-bg-soft text-ink-muted border border-line"
        }`}
      >
        {done ? <Icons.Check size={16} /> : n}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-display font-medium text-ink">{title}</h3>
        <p className="text-sm text-ink-muted mt-1 leading-relaxed">{description}</p>
        {cta && (
          <Link
            href={cta.href as any}
            className="inline-flex items-center gap-1 mt-3 text-sm text-lime-deep hover:text-ink font-medium transition"
          >
            {cta.label} <Icons.ArrowRight size={12} />
          </Link>
        )}
      </div>
    </li>
  );
}
