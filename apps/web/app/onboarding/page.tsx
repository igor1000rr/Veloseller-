import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
    <main className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Добро пожаловать в Veloseller!</h1>
        <p className="text-slate-600 mb-8">3 шага до первого расчёта TVelo:</p>

        <ol className="space-y-4">
          <Step
            n={1}
            title="Подключи источник данных"
            done={step1Done}
            description="CSV-файл, Google Sheet, Ozon или Wildberries API"
            cta={!step1Done ? { href: "/connections/new", label: "Подключить" } : null}
          />
          <Step
            n={2}
            title="Загрузи первые snapshots"
            done={step2Done}
            description="Первый sync произойдёт автоматически после подключения"
            cta={step1Done && !step2Done ? { href: "/connections", label: "Запустить sync" } : null}
          />
          <Step
            n={3}
            title="Дождись пересчёта"
            done={step3Done}
            description="Cron запускается каждый час, или нажми «Пересчитать сейчас» на dashboard"
            cta={step2Done && !step3Done ? { href: "/dashboard", label: "Открыть dashboard" } : null}
          />
        </ol>

        {step1Done && step2Done && step3Done && (
          <div className="mt-8 p-6 bg-teal-50 border border-teal-200 rounded-xl text-center">
            <p className="text-teal-900 font-medium mb-3">🎉 Готово! Veloseller считает твою скорость продаж.</p>
            <Link
              href="/dashboard"
              className="inline-block bg-teal-700 hover:bg-teal-800 text-white px-6 py-2.5 rounded-lg font-medium"
            >
              Открыть dashboard →
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

function Step({ n, title, done, description, cta }: {
  n: number; title: string; done: boolean; description: string;
  cta: { href: string; label: string } | null;
}) {
  return (
    <li className={`flex gap-4 p-5 rounded-xl border ${done ? "bg-teal-50 border-teal-200" : "bg-white border-slate-200"}`}>
      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold ${done ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600"}`}>
        {done ? "✓" : n}
      </div>
      <div className="flex-1">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-600 mt-1">{description}</p>
        {cta && (
          <Link href={cta.href as any} className="inline-block mt-3 text-sm text-teal-700 hover:underline font-medium">
            {cta.label} →
          </Link>
        )}
      </div>
    </li>
  );
}
