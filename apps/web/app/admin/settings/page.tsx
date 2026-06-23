import { loadSystemSettings } from "@/lib/admin/system-settings";
import SettingsForm from "./SettingsForm";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, { title: string; desc: string; tone: string }> = {
  access:        { title: "Доступ и режимы",       desc: "Регистрация, maintenance mode, фичи-флаги",   tone: "lime" },
  billing:       { title: "Биллинг",                desc: "Триал, Робокасса, цены",                    tone: "emerald" },
  limits:        { title: "Лимиты планов",          desc: "Ограничения по количеству SKU и магазинов",  tone: "azure" },
  pipeline:      { title: "Pipeline",               desc: "Частота snapshots, параметры расчётов",   tone: "orange" },
  notifications: { title: "Уведомления",           desc: "Настройки по умолчанию для новых селлеров", tone: "azure" },
  branding:      { title: "Брендинг",                desc: "Название платформы, мета-данные",     tone: "lime" },
};

export default async function AdminSettingsPage() {
  const settings = await loadSystemSettings();

  return (
    <div className="space-y-8 md:space-y-10">
      <header>
        <div className="inline-flex items-center gap-2">
          <span className="size-1 rounded-full bg-lime-deep" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">Admin / Settings</span>
        </div>
        <h1 className="mt-2 font-display text-3xl md:text-4xl tracking-tight font-medium">Системные настройки</h1>
        <p className="mt-1.5 text-ink-muted text-sm">Конфигурация платформы. Изменения применяются сразу.</p>
      </header>

      {Object.entries(settings).map(([category, items]) => {
        const meta = CATEGORY_LABELS[category] || { title: category, desc: "", tone: "lime" };
        return (
          <section key={category}>
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <h2 className="font-display text-xl md:text-2xl tracking-tight font-medium">{meta.title}</h2>
                <p className="mt-1 text-sm text-ink-muted">{meta.desc}</p>
              </div>
              <span className="font-mono text-[10px] text-ink-hush uppercase tracking-widest">{items.length}</span>
            </div>
            <div className="rounded-2xl border border-line bg-paper overflow-hidden">
              {items.map((s, i) => (
                <div key={s.key} className={`px-4 md:px-6 py-4 ${i < items.length - 1 ? "border-b border-line" : ""}`}>
                  <SettingsForm setting={s} />
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <div className="rounded-2xl border border-orange/30 bg-orange/[0.05] p-5 md:p-6">
        <div className="flex items-start gap-3">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" className="text-orange shrink-0 mt-0.5">
            <path d="M11 2L1 19h20L11 2zM11 9v4M11 16v.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div>
            <h3 className="font-display text-base font-medium text-ink">Осторожно</h3>
            <p className="mt-1 text-sm text-ink-muted">
              Изменение этих настроек влияет на всех селлеров. <code className="px-1 py-0.5 bg-bg-soft rounded font-mono text-xs text-ink-soft">maintenance_mode = true</code>{" "}
              закроет вход всем. Настройки лимитов меняйте осмысленно — они влияют на quotas новых подписок.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
