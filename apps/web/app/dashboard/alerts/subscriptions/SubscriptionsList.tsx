"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../../_components/Icons";
import {
  upsertSubscription,
  deleteSubscription,
  toggleSubscription,
  type NotificationKind,
  type NotificationChannel,
  type NotificationFrequency,
} from "./actions";
import { t } from "@/lib/i18n";

export type KindMeta = {
  label: string;
  description: string;
  paramSchema: Array<{
    key: string;
    label: string;
    type: "number" | "select";
    default: number;
    min?: number;
    max?: number;
    suffix?: string;
    options?: { value: number; label: string }[];
    hint?: string;
  }>;
  /** Александр 01.06.2026: некоторые kinds депрекейтнуты — не показываем
      в селекторе "Добавить отчёт", но если уже подписан — оставляем как есть. */
  deprecated?: boolean;
};

const DAY_OF_WEEK_PARAM = {
  key: "day_of_week",
  label: t("subs.param.dayOfWeek"),
  type: "select" as const,
  default: 1,
  options: [
    { value: 1, label: t("subs.day.mon") },
    { value: 2, label: t("subs.day.tue") },
    { value: 3, label: t("subs.day.wed") },
    { value: 4, label: t("subs.day.thu") },
    { value: 5, label: t("subs.day.fri") },
    { value: 6, label: t("subs.day.sat") },
    { value: 7, label: t("subs.day.sun") },
  ],
  hint: t("subs.param.dayHint"),
};

/**
 * Александр 01.06.2026 (Veloseller_Отчёт.txt) разделил отчёты:
 * - Еженедельный Excel — операционный (4 листа)
 * - Месячный PDF — управленческий (автоматически в начале месяца)
 *
 * Активные kinds в Excel: weekly_report, underestimated_sku, critical_stock, dead_inventory.
 * Депрекейтнуто (но не удалено для backward compat):
 * - low_stock         — дублирует critical_stock
 * - repeated_stockout — дублирует underestimated_sku
 * - sync_error        — теперь шлётся отдельным email при ошибке sync
 *
 * Депрекейтнутые отображаются у тех у кого они уже есть, но в селектор
 * "Добавить отчёт" не предлагаются.
 */
export const KIND_META: Record<NotificationKind, KindMeta> = {
  weekly_report: {
    label: t("subs.kind.weeklyReport"),
    description: t("subs.kind.weeklyReportDesc"),
    paramSchema: [DAY_OF_WEEK_PARAM],
  },
  underestimated_sku: {
    label: t("subs.kind.underestimated"),
    description: t("subs.kind.underestimatedDesc"),
    paramSchema: [DAY_OF_WEEK_PARAM],
  },
  critical_stock: {
    label: t("subs.kind.critical"),
    description: t("subs.kind.criticalDesc"),
    paramSchema: [
      {
        key: "coverage_days_threshold", label: t("subs.param.coverage"),
        type: "number", default: 3, min: 1, max: 14, suffix: t("subs.unit.dn"),
      },
      DAY_OF_WEEK_PARAM,
    ],
  },
  dead_inventory: {
    label: t("subs.kind.dead"),
    description: t("subs.kind.deadDesc"),
    paramSchema: [
      {
        key: "coverage_days_threshold", label: t("subs.param.coverage"),
        type: "number", default: 180, min: 30, max: 365, suffix: t("subs.unit.dn"),
        hint: t("subs.param.deadHint"),
      },
      DAY_OF_WEEK_PARAM,
    ],
  },

  // Депрекейтнутые — показываем как есть если уже подписан, но не предлагаем добавить.
  low_stock: {
    label: t("subs.kind.low"),
    description: t("subs.kind.lowDesc"),
    deprecated: true,
    paramSchema: [
      {
        key: "coverage_days_threshold", label: t("subs.param.coverage"),
        type: "number", default: 7, min: 1, max: 60, suffix: t("subs.unit.dn"),
        hint: t("subs.param.lowHint"),
      },
      DAY_OF_WEEK_PARAM,
    ],
  },
  repeated_stockout: {
    label: t("subs.kind.stockout"),
    description: t("subs.kind.stockoutDesc"),
    deprecated: true,
    paramSchema: [
      {
        key: "stockout_days_threshold", label: t("subs.param.oosDays"),
        type: "number", default: 3, min: 1, max: 30, suffix: t("subs.unit.dn"),
      },
      DAY_OF_WEEK_PARAM,
    ],
  },
  sync_error: {
    label: t("subs.kind.syncError"),
    description: t("subs.kind.syncErrorDesc"),
    deprecated: true,
    paramSchema: [DAY_OF_WEEK_PARAM],
  },
};

const FREQUENCY_OPTIONS: Array<{ value: NotificationFrequency; label: string; hint: string }> = [
  { value: "daily",   label: t("subs.freq.daily"), hint: t("subs.freq.dailyHint") },
  { value: "weekly",  label: t("subs.freq.weekly"), hint: t("subs.freq.weeklyHint") },
  { value: "monthly", label: t("subs.freq.monthly"),  hint: t("subs.freq.monthlyHint") },
];

function frequencyLabel(f: NotificationFrequency): string {
  return FREQUENCY_OPTIONS.find(o => o.value === f)?.label ?? t("subs.freq.weekly");
}

export type Subscription = {
  id: string;
  kind: NotificationKind;
  channel: NotificationChannel;
  enabled: boolean;
  params: Record<string, any>;
  frequency: NotificationFrequency | null;
  created_at: string;
};

export function SubscriptionsList({ subscriptions }: { subscriptions: Subscription[] }) {
  const [adding, setAdding] = useState(false);
  const router = useRouter();
  const [, startTransition] = useTransition();

  const cleanSubs = subscriptions.filter(s => s.kind in KIND_META);

  const subscribedPairs = new Set(cleanSubs.map(s => `${s.kind}__${s.channel}`));
  const availableToAdd: Array<{ kind: NotificationKind; channel: NotificationChannel }> = [];
  for (const kind of Object.keys(KIND_META) as NotificationKind[]) {
    // Депрекейтнутые kinds не предлагаем добавить
    if (KIND_META[kind].deprecated) continue;
    for (const channel of ["email", "telegram"] as NotificationChannel[]) {
      if (!subscribedPairs.has(`${kind}__${channel}`)) {
        availableToAdd.push({ kind, channel });
      }
    }
  }

  return (
    <div className="space-y-3">
      {cleanSubs.length === 0 && !adding && (
        <div className="rounded-2xl border border-line bg-paper p-8 md:p-10 text-center">
          <p className="font-display text-lg text-ink font-medium">{t("subs.empty.title")}</p>
          <p className="mt-2 text-sm text-ink-muted max-w-md mx-auto">{t("subs.empty.text")}</p>
        </div>
      )}

      {cleanSubs.map(sub => (
        <SubscriptionRow key={sub.id} sub={sub} />
      ))}

      {adding ? (
        <AddSubscriptionForm
          availableToAdd={availableToAdd}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            startTransition(() => router.refresh());
          }}
        />
      ) : availableToAdd.length > 0 ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-paper p-4 text-ink-muted hover:text-ink hover:border-lime-deep/40 hover:bg-bg-soft transition font-medium min-h-[56px]"
        >
          <Icons.ArrowRight size={14} /> {t("subs.addBtn")}
        </button>
      ) : (
        <div className="text-xs text-ink-hush text-center py-2">{t("subs.allSubscribed")}</div>
      )}
    </div>
  );
}

function SubscriptionRow({ sub }: { sub: Subscription }) {
  const meta = KIND_META[sub.kind];
  const [editing, setEditing] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const currentFreq: NotificationFrequency = sub.frequency ?? "weekly";

  function handleToggle() {
    setError(null);
    startTransition(async () => {
      const res = await toggleSubscription(sub.id, !sub.enabled);
      if (!res.ok) setError(res.error ?? t("subs.err.generic"));
      else router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm(t("subs.confirmDelete", { name: meta.label }))) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteSubscription(sub.id);
      if (!res.ok) setError(res.error ?? t("subs.err.generic"));
      else router.refresh();
    });
  }

  return (
    <div className={`rounded-2xl border bg-paper transition ${
      sub.enabled ? "border-line" : "border-line opacity-60"
    }`}>
      <div className="p-3 sm:p-4 flex items-start gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleToggle}
          className={`shrink-0 mt-1 size-6 rounded border flex items-center justify-center transition ${
            sub.enabled ? "bg-lime-deep border-lime-deep" : "bg-paper border-line hover:border-ink-muted"
          }`}
          title={sub.enabled ? t("subs.toggleOn") : t("subs.toggleOff")}
        >
          {sub.enabled && <span className="text-paper text-[14px] leading-none">✓</span>}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display text-base font-medium text-ink">{meta.label}</span>
            <ChannelBadge channel={sub.channel} />
            <FrequencyBadge frequency={currentFreq} />
            {meta.deprecated && (
              <span className="inline-flex items-center font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border font-semibold text-orange bg-orange/10 border-orange/30">{t("subs.deprecated")}</span>
            )}
            {!sub.enabled && (
              <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">{t("subs.disabledSuffix")}</span>
            )}
          </div>
          <p className="text-xs text-ink-muted mt-1">{meta.description}</p>
          {meta.paramSchema.length > 0 && (
            <div className="mt-2 flex items-center gap-3 flex-wrap text-xs">
              {meta.paramSchema.map(param => {
                if (param.key === "day_of_week" && currentFreq === "daily") return null;
                const val = sub.params[param.key] ?? param.default;
                let displayVal: string;
                if (param.type === "select" && param.options) {
                  displayVal = param.options.find(o => o.value === val)?.label ?? String(val);
                } else {
                  displayVal = String(val) + (param.suffix ?? "");
                }
                return (
                  <span key={param.key} className="font-mono text-ink-soft">
                    <span className="text-ink-hush">{param.label}:</span> <span className="font-semibold">{displayVal}</span>
                  </span>
                );
              })}
              <span className="font-mono text-ink-soft">
                <span className="text-ink-hush">{t("subs.freqLabel")}</span> <span className="font-semibold">{frequencyLabel(currentFreq)}</span>
              </span>
            </div>
          )}
          {error && (
            <p className="mt-2 text-xs text-rose font-mono">{error}</p>
          )}
        </div>

        <div className="w-full sm:w-auto flex items-center gap-2 sm:shrink-0">
          <button
            type="button"
            onClick={() => setEditing(e => !e)}
            className="flex-1 sm:flex-initial text-xs px-3 py-2 rounded-lg border border-line text-ink-muted hover:text-ink hover:bg-bg-soft transition font-medium min-h-[36px]"
          >
            {editing ? t("subs.close") : t("subs.edit")}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="flex-1 sm:flex-initial text-xs px-3 py-2 rounded-lg border border-rose/30 text-rose hover:bg-rose/5 transition font-medium min-h-[36px]"
            title={t("subs.deleteTip")}
          >
            {t("subs.delete")}
          </button>
        </div>
      </div>

      {editing && (
        <EditParamsForm sub={sub} meta={meta} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

function EditParamsForm({ sub, meta, onClose }: { sub: Subscription; meta: KindMeta; onClose: () => void }) {
  const router = useRouter();
  const [params, setParams] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const p of meta.paramSchema) {
      init[p.key] = sub.params[p.key] ?? p.default;
    }
    return init;
  });
  const [frequency, setFrequency] = useState<NotificationFrequency>(sub.frequency ?? "weekly");
  const [, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDayDisabled = frequency === "daily";

  function handleSave() {
    setError(null);
    setSaving(true);
    startTransition(async () => {
      const res = await upsertSubscription(sub.kind, sub.channel, sub.enabled, params, frequency);
      setSaving(false);
      if (!res.ok) {
        setError(res.error ?? t("subs.err.save"));
      } else {
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <div className="border-t border-line p-3 sm:p-4 bg-bg-soft">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {meta.paramSchema.map(p => {
          const disabled = p.key === "day_of_week" && isDayDisabled;
          return (
            <div key={p.key} className={disabled ? "opacity-50" : ""}>
              <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-1.5">
                {p.label}
                {disabled && <span className="ml-1 normal-case text-ink-hush"> {t("subs.param.dayUnused")}</span>}
              </label>
              {p.type === "select" && p.options ? (
                <select
                  value={params[p.key]}
                  onChange={e => setParams({ ...params, [p.key]: parseInt(e.target.value, 10) })}
                  disabled={disabled}
                  className="w-full px-2 py-2 border border-line rounded-lg bg-paper text-sm focus:outline-none focus:border-lime-deep min-h-[40px] disabled:bg-bg-soft disabled:cursor-not-allowed"
                >
                  {p.options.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={params[p.key]}
                    min={p.min}
                    max={p.max}
                    disabled={disabled}
                    onChange={e => setParams({ ...params, [p.key]: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-2 py-2 border border-line rounded-lg bg-paper font-mono text-sm focus:outline-none focus:border-lime-deep min-h-[40px] disabled:bg-bg-soft disabled:cursor-not-allowed"
                  />
                  {p.suffix && <span className="text-xs text-ink-muted">{p.suffix}</span>}
                </div>
              )}
              {p.hint && !disabled && <p className="mt-1 text-[11px] text-ink-hush">{p.hint}</p>}
            </div>
          );
        })}
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-1.5">{t("subs.param.frequency")}</label>
          <select
            value={frequency}
            onChange={e => setFrequency(e.target.value as NotificationFrequency)}
            className="w-full px-2 py-2 border border-line rounded-lg bg-paper text-sm focus:outline-none focus:border-lime-deep min-h-[40px]"
          >
            {FREQUENCY_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-ink-hush">
            {FREQUENCY_OPTIONS.find(o => o.value === frequency)?.hint}
          </p>
        </div>
      </div>
      {error && <p className="mt-3 text-xs text-rose font-mono">{error}</p>}
      <div className="mt-3 flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 sm:flex-initial px-4 py-2 text-sm bg-ink text-paper rounded-lg hover:bg-ink-soft disabled:opacity-50 transition font-medium min-h-[40px]"
        >
          {saving ? t("subs.saving") : t("subs.save")}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 sm:flex-initial px-4 py-2 text-sm border border-line text-ink-muted hover:text-ink hover:bg-paper rounded-lg transition min-h-[40px]"
        >
          {t("subs.cancel")}
        </button>
      </div>
    </div>
  );
}

function AddSubscriptionForm({
  availableToAdd, onClose, onAdded,
}: {
  availableToAdd: Array<{ kind: NotificationKind; channel: NotificationChannel }>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [kind, setKind] = useState<NotificationKind>(availableToAdd[0]?.kind ?? "weekly_report");
  const [channel, setChannel] = useState<NotificationChannel>(availableToAdd[0]?.channel ?? "email");
  const [frequency, setFrequency] = useState<NotificationFrequency>("weekly");
  const [, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableKinds = Array.from(new Set(availableToAdd.map(a => a.kind))) as NotificationKind[];
  const availableChannelsForKind = availableToAdd
    .filter(a => a.kind === kind)
    .map(a => a.channel);

  // Александр 01.06.2026: в селектор показываем ВСЕ каналы, занятые
  // блокируем с пометкой "уже подписан" — иначе непонятно почему недоступен.
  const ALL_CHANNELS: NotificationChannel[] = ["email", "telegram"];

  useEffect(() => {
    if (!availableChannelsForKind.includes(channel) && availableChannelsForKind.length > 0) {
      setChannel(availableChannelsForKind[0]);
    }
  }, [kind, channel, availableChannelsForKind]);

  const meta = KIND_META[kind];
  const channelIsTaken = !availableChannelsForKind.includes(channel);

  function handleAdd() {
    if (channelIsTaken) return;
    setError(null);
    setSaving(true);
    const params: Record<string, number> = {};
    for (const p of meta.paramSchema) params[p.key] = p.default;

    startTransition(async () => {
      const res = await upsertSubscription(kind, channel, true, params, frequency);
      setSaving(false);
      if (!res.ok) {
        setError(res.error ?? t("subs.err.generic"));
      } else {
        onAdded();
      }
    });
  }

  return (
    <div className="rounded-2xl border-2 border-lime-deep/40 bg-lime-soft p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-base font-medium text-ink">{t("subs.add.title")}</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-ink-hush hover:text-ink text-base px-2 py-1"
          aria-label={t("subs.close")}
        >
          ✕
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-1.5">{t("subs.add.kind")}</label>
          <select
            value={kind}
            onChange={e => setKind(e.target.value as NotificationKind)}
            className="w-full px-2 py-2 border border-line rounded-lg bg-paper text-sm focus:outline-none focus:border-lime-deep min-h-[40px]"
          >
            {availableKinds.map(k => (
              <option key={k} value={k}>{KIND_META[k].label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-1.5">{t("subs.add.channel")}</label>
          <select
            value={channel}
            onChange={e => setChannel(e.target.value as NotificationChannel)}
            className="w-full px-2 py-2 border border-line rounded-lg bg-paper text-sm focus:outline-none focus:border-lime-deep min-h-[40px]"
          >
            {ALL_CHANNELS.map(c => {
              const taken = !availableChannelsForKind.includes(c);
              const label = c === "email" ? "Email" : "Telegram";
              return (
                <option key={c} value={c} disabled={taken}>
                  {label}{taken ? t("subs.add.taken") : ""}
                </option>
              );
            })}
          </select>
        </div>
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-1.5">{t("subs.add.frequency")}</label>
          <select
            value={frequency}
            onChange={e => setFrequency(e.target.value as NotificationFrequency)}
            className="w-full px-2 py-2 border border-line rounded-lg bg-paper text-sm focus:outline-none focus:border-lime-deep min-h-[40px]"
          >
            {FREQUENCY_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-muted">{meta.description}</p>
      <p className="mt-1 text-[11px] text-ink-hush">{t("subs.add.note")}</p>
      {channelIsTaken && (
        <p className="mt-2 text-xs text-orange">{t("subs.add.takenWarn")}</p>
      )}
      {error && <p className="mt-3 text-xs text-rose font-mono">{error}</p>}
      <div className="mt-4 flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving || channelIsTaken}
          className="flex-1 sm:flex-initial px-4 py-2.5 text-sm bg-ink text-paper rounded-lg hover:bg-ink-soft disabled:opacity-50 disabled:cursor-not-allowed transition font-medium min-h-[44px]"
        >
          {saving ? t("subs.adding") : t("subs.addShort")}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 sm:flex-initial px-4 py-2.5 text-sm border border-line text-ink-muted hover:text-ink hover:bg-paper rounded-lg transition min-h-[44px]"
        >
          {t("subs.cancel")}
        </button>
      </div>
    </div>
  );
}

function ChannelBadge({ channel }: { channel: NotificationChannel }) {
  if (channel === "email") {
    return (
      <span className="inline-flex items-center font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border font-semibold text-azure bg-azure/10 border-azure/30">
        Email
      </span>
    );
  }
  return (
    <span className="inline-flex items-center font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border font-semibold text-lime-deep bg-lime-soft border-lime-deep/30">
      Telegram
    </span>
  );
}

function FrequencyBadge({ frequency }: { frequency: NotificationFrequency }) {
  const label = frequencyLabel(frequency);
  const cls =
    frequency === "daily"   ? "text-rose bg-rose/10 border-rose/30"
    : frequency === "monthly" ? "text-orange bg-orange/10 border-orange/30"
    :                           "text-ink-soft bg-bg-soft border-line";
  return (
    <span className={`inline-flex items-center font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border font-semibold ${cls}`}>
      {label}
    </span>
  );
}
