import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Админ-панель Radar: статистика по тарифам, затратам на AI/Wordstat,
 * активность селлеров, последние upload'ы.
 *
 * Источники:
 *   sellers (radar_plan, radar_brands_limit, radar_active_until, radar_trial_started_at)
 *   radar_brands, radar_queries, radar_query_history (для масштаба активности)
 *   radar_price_uploads (для AI юнит-экономики — ai_cost_usd, токены)
 *   radar_actions (для engagement — favorites/archives)
 */
export default async function AdminRadarPage() {
  const sb = createSupabaseAdminClient();
  const now = new Date();
  const day7Ago = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const day30Ago = new Date(now.getTime() - 30 * 86400_000).toISOString();

  const [
    { count: sellersWithPlan },
    { count: sellersTrial },
    { count: sellersStart },
    { count: sellersSeller },
    { count: sellersPro },
    { count: sellersExpert },
    { count: brandsTotal },
    { count: brandsApproved },
    { count: queriesTotal },
    { count: queriesWatching },
    { count: queriesNew },
    { count: uploadsTotal },
    { count: uploadsFailed },
    { count: actions30d },
    { data: aiCostStats },
    { data: topUploads },
    { data: recentUploads },
    { data: activeSellers },
  ] = await Promise.all([
    sb.from("sellers").select("id", { count: "exact", head: true }).neq("radar_plan", "none").not("radar_plan", "is", null),
    sb.from("sellers").select("id", { count: "exact", head: true }).eq("radar_plan", "trial"),
    sb.from("sellers").select("id", { count: "exact", head: true }).eq("radar_plan", "start"),
    sb.from("sellers").select("id", { count: "exact", head: true }).eq("radar_plan", "seller"),
    sb.from("sellers").select("id", { count: "exact", head: true }).eq("radar_plan", "pro"),
    sb.from("sellers").select("id", { count: "exact", head: true }).eq("radar_plan", "expert"),
    sb.from("radar_brands").select("id", { count: "exact", head: true }),
    sb.from("radar_brands").select("id", { count: "exact", head: true }).eq("status", "approved"),
    sb.from("radar_queries").select("id", { count: "exact", head: true }),
    sb.from("radar_queries").select("id", { count: "exact", head: true }).eq("status", "watching"),
    sb.from("radar_queries").select("id", { count: "exact", head: true }).eq("status", "new"),
    sb.from("radar_price_uploads").select("id", { count: "exact", head: true }),
    sb.from("radar_price_uploads").select("id", { count: "exact", head: true }).eq("status", "failed"),
    sb.from("radar_actions").select("id", { count: "exact", head: true }).gte("created_at", day30Ago),

    // AI costs aggregated (за 30 дней)
    sb.from("radar_price_uploads")
      .select("ai_cost_usd, ai_input_tokens, ai_output_tokens, brands_extracted")
      .gte("created_at", day30Ago)
      .eq("status", "completed"),

    // Top by AI spend
    sb.from("radar_price_uploads")
      .select("id, seller_id, file_name, ai_cost_usd, ai_model, brands_extracted, rows_total, created_at, sellers(email)")
      .eq("status", "completed")
      .order("ai_cost_usd", { ascending: false, nullsFirst: false })
      .limit(10),

    // Последние uploads
    sb.from("radar_price_uploads")
      .select("id, seller_id, file_name, status, brands_extracted, rows_total, ai_cost_usd, created_at, sellers(email)")
      .order("created_at", { ascending: false })
      .limit(10),

    // Активные селлеры (Radar)
    sb.from("sellers")
      .select("id, email, radar_plan, radar_brands_limit, radar_active_until")
      .neq("radar_plan", "none")
      .not("radar_plan", "is", null)
      .order("radar_active_until", { ascending: false, nullsFirst: true })
      .limit(20),
  ]);

  // AI costs aggregation
  const aiCostsArr = (aiCostStats ?? []) as any[];
  const totalAiCostUsd = aiCostsArr.reduce((sum, r) => sum + Number(r.ai_cost_usd ?? 0), 0);
  const totalInputTokens = aiCostsArr.reduce((sum, r) => sum + Number(r.ai_input_tokens ?? 0), 0);
  const totalOutputTokens = aiCostsArr.reduce((sum, r) => sum + Number(r.ai_output_tokens ?? 0), 0);
  const totalBrandsExtracted = aiCostsArr.reduce((sum, r) => sum + Number(r.brands_extracted ?? 0), 0);
  const avgCostPerBrand = totalBrandsExtracted > 0 ? totalAiCostUsd / totalBrandsExtracted : 0;

  const planRows = [
    { plan: "trial",   count: sellersTrial   ?? 0, color: "border-line bg-bg-soft text-ink-muted" },
    { plan: "start",   count: sellersStart   ?? 0, color: "border-azure/30 bg-azure/10 text-azure" },
    { plan: "seller",  count: sellersSeller  ?? 0, color: "border-lime-deep/30 bg-lime-soft text-lime-deep" },
    { plan: "pro",     count: sellersPro     ?? 0, color: "border-orange/30 bg-orange/10 text-orange" },
    { plan: "expert",  count: sellersExpert  ?? 0, color: "border-rose/30 bg-rose/10 text-rose" },
  ];
  const planTotal = planRows.reduce((s, r) => s + r.count, 0);

  const usdFmt = (n: number) => `$${n.toFixed(2)}`;

  return (
    <div className="space-y-6 md:space-y-10">
      <header>
        <div className="inline-flex items-center gap-2">
          <span className="size-1 rounded-full bg-orange" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-orange font-semibold">Admin / Radar</span>
        </div>
        <h1 className="mt-2 font-display text-2xl sm:text-3xl md:text-4xl tracking-tight font-medium">Radar модуль</h1>
        <p className="mt-1.5 text-ink-muted text-sm">
          Юнит-экономика, активность селлеров, расход на AI и Wordstat
        </p>
      </header>

      {/* Главные KPI */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <BigKpi label="Селлеры на Radar" value={sellersWithPlan ?? 0} delta={`${planTotal} активных`} tone="lime" />
        <BigKpi label="Затраты на AI · 30д" valueText={usdFmt(totalAiCostUsd)} delta={`${aiCostsArr.length} uploads`} tone="emerald" />
        <BigKpi label="Активных брендов" value={brandsApproved ?? 0} delta={`${brandsTotal ?? 0} всего`} tone="azure" />
        <BigKpi label="Сигналов всего" value={queriesTotal ?? 0} delta={`${queriesNew ?? 0} new, ${queriesWatching ?? 0} watch`} tone="orange" />
      </section>

      {/* Secondary */}
      <section className="grid grid-cols-2 md:grid-cols-6 gap-2 md:gap-3">
        <SmallKpi label="Upload'ов всего" value={uploadsTotal ?? 0} />
        <SmallKpi label="Failed" value={uploadsFailed ?? 0} tone={uploadsFailed ? "warn" : undefined} />
        <SmallKpi label="Tokens IN · 30д" value={totalInputTokens} />
        <SmallKpi label="Tokens OUT · 30д" value={totalOutputTokens} />
        <SmallKpi label="Actions · 30д" value={actions30d ?? 0} />
        <SmallKpi
          label="$/бренд"
          valueText={avgCostPerBrand > 0 ? `$${avgCostPerBrand.toFixed(4)}` : "—"}
        />
      </section>

      {/* Распределение по тарифам */}
      <section>
        <SectionTitle>Распределение по тарифам Radar</SectionTitle>
        <div className="rounded-2xl border border-line bg-paper p-5">
          {planTotal === 0 ? (
            <p className="text-sm text-ink-muted text-center py-4">
              Пока ни одного селлера на Radar
            </p>
          ) : (
            <div className="space-y-2">
              {planRows.map(r => {
                const pct = planTotal > 0 ? (r.count / planTotal) * 100 : 0;
                return (
                  <div key={r.plan}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs uppercase tracking-wider text-ink-soft">
                        {r.plan}
                      </span>
                      <span className="font-display text-lg tabular text-ink">
                        {r.count}
                        <span className="font-mono text-[10px] text-ink-hush ml-2">
                          {pct.toFixed(0)}%
                        </span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-bg-soft overflow-hidden">
                      <div className={`h-full rounded-full ${r.color.split(" ").find(c => c.startsWith("bg-")) ?? "bg-lime-deep"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Топ-затраты на AI */}
      {topUploads && topUploads.length > 0 && (
        <section>
          <SectionTitle>Топ Upload&apos;ов по стоимости AI</SectionTitle>
          <div className="rounded-2xl border border-line bg-paper overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg-soft border-b border-line">
                <tr>
                  <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Селлер</th>
                  <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Файл</th>
                  <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Брендов</th>
                  <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Строк</th>
                  <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">$ AI</th>
                </tr>
              </thead>
              <tbody>
                {topUploads.map((u: any) => {
                  const seller = Array.isArray(u.sellers) ? u.sellers[0] : u.sellers;
                  return (
                    <tr key={u.id} className="border-b border-line last:border-0 hover:bg-bg-soft/40">
                      <td className="px-4 py-3">
                        <Link href={`/admin/sellers/${u.seller_id}` as any} className="text-ink hover:text-lime-deep transition text-xs">
                          {seller?.email ?? "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-ink text-xs truncate max-w-xs" title={u.file_name}>
                        {u.file_name}
                      </td>
                      <td className="px-4 py-3 text-right tabular text-ink">
                        {u.brands_extracted ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right tabular text-ink-muted">
                        {u.rows_total ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right tabular text-lime-deep font-medium">
                        ${Number(u.ai_cost_usd ?? 0).toFixed(4)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Последние upload'ы */}
      {recentUploads && recentUploads.length > 0 && (
        <section>
          <SectionTitle>Последние загрузки прайсов</SectionTitle>
          <div className="rounded-2xl border border-line bg-paper overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg-soft border-b border-line">
                <tr>
                  <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Селлер</th>
                  <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Файл</th>
                  <th className="text-center px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Статус</th>
                  <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Брендов</th>
                  <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Когда</th>
                </tr>
              </thead>
              <tbody>
                {recentUploads.map((u: any) => {
                  const seller = Array.isArray(u.sellers) ? u.sellers[0] : u.sellers;
                  return (
                    <tr key={u.id} className="border-b border-line last:border-0 hover:bg-bg-soft/40">
                      <td className="px-4 py-3">
                        <Link href={`/admin/sellers/${u.seller_id}` as any} className="text-ink hover:text-lime-deep transition text-xs">
                          {seller?.email ?? "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-ink text-xs truncate max-w-xs" title={u.file_name}>
                        {u.file_name}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={u.status} />
                      </td>
                      <td className="px-4 py-3 text-right tabular text-ink">
                        {u.brands_extracted ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-ink-hush text-xs whitespace-nowrap">
                        {new Date(u.created_at).toLocaleString("ru-RU")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Активные селлеры */}
      {activeSellers && activeSellers.length > 0 && (
        <section>
          <SectionTitle>Активные подписчики Radar</SectionTitle>
          <div className="rounded-2xl border border-line bg-paper overflow-hidden divide-y divide-line">
            {activeSellers.map((s: any) => {
              const validUntil = s.radar_active_until
                ? new Date(s.radar_active_until).toLocaleDateString("ru-RU")
                : "trial";
              const daysLeft = s.radar_active_until
                ? Math.floor((new Date(s.radar_active_until).getTime() - Date.now()) / 86400_000)
                : null;
              return (
                <Link
                  key={s.id}
                  href={`/admin/sellers/${s.id}` as any}
                  className="flex items-center justify-between px-4 py-3 hover:bg-bg-soft/40 transition gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-ink truncate">{s.email}</div>
                    <div className="font-mono text-[10px] text-ink-hush">
                      План {s.radar_plan} · до {s.radar_brands_limit} брендов · валиден до {validUntil}
                    </div>
                  </div>
                  {daysLeft !== null && (
                    <span className={`font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded shrink-0 ${
                      daysLeft < 3 ? "bg-rose/10 text-rose"
                      : daysLeft < 14 ? "bg-orange/10 text-orange"
                      : "bg-lime-soft text-lime-deep"
                    }`}>
                      {daysLeft} дн
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function BigKpi({ label, value, valueText, delta, tone }: {
  label: string; value?: number; valueText?: string; delta?: string;
  tone: "lime" | "emerald" | "orange" | "azure";
}) {
  const accents = {
    lime:    "border-lime-deep/30 bg-lime-soft text-lime-deep",
    emerald: "border-emerald/30 bg-emerald/10 text-emerald",
    orange:  "border-orange/30 bg-orange/10 text-orange",
    azure:   "border-azure/30 bg-azure/10 text-azure",
  };
  const displayValue = valueText !== undefined
    ? valueText
    : typeof value === "number" ? value.toLocaleString("ru-RU") : value;
  return (
    <div className="bg-paper border border-line rounded-2xl p-4 sm:p-5 md:p-6 hover:shadow-sm transition">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hush">{label}</div>
      <div className="mt-2 font-display text-xl sm:text-2xl md:text-3xl lg:text-4xl tracking-tight tabular font-medium text-ink break-words">
        {displayValue}
      </div>
      {delta && (
        <div className={`inline-flex mt-3 px-2 py-0.5 rounded-md font-mono text-[10px] uppercase tracking-widest border ${accents[tone]} break-words`}>
          {delta}
        </div>
      )}
    </div>
  );
}

function SmallKpi({ label, value, valueText, tone }: {
  label: string; value?: number; valueText?: string; tone?: "warn" | "bad";
}) {
  const color = tone === "bad" ? "text-rose" : tone === "warn" ? "text-orange" : "text-ink";
  return (
    <div className="bg-paper border border-line rounded-xl p-3 sm:p-4">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-hush">{label}</div>
      <div className={`mt-1.5 font-display text-lg sm:text-xl md:text-2xl tabular font-medium ${color}`}>
        {valueText !== undefined ? valueText : (value ?? 0).toLocaleString("ru-RU")}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="size-1 rounded-full bg-lime-deep" />
      <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] font-semibold text-lime-deep">
        {children}
      </h2>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "completed" ? "bg-lime-soft text-lime-deep border-lime-deep/30"
    : status === "processing" ? "bg-azure/10 text-azure border-azure/30"
    : status === "failed" ? "bg-rose/10 text-rose border-rose/30"
    : "bg-bg-soft text-ink-muted border-line";
  return (
    <span className={`inline-flex items-center font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded border ${cls}`}>
      {status}
    </span>
  );
}
