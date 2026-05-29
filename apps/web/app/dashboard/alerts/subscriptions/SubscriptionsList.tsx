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
};

/**
 * Все kinds имеют параметр day_of_week (1-7) — день формирования отчёта.
 * Частота отправки (daily/weekly/monthly) хранится отдельной колонкой
 * notification_subscriptions.frequency, а не в params.
 *
 * Для daily частоты day_of_week игнорируется на стороне worker'а, но
 * хранится для возврата если юзер переключит обратно на weekly/monthly.
 */
const DAY_OF_WEEK_PARAM = {
  key: "day_of_week",
  label: "День отправки",
  type: "select" as const,
  default: 1,
  options: [
    { value: 1, label: "Понедельник" },
    { value: 2, label: "Вторник" },
    { value: 3, label: "Среда" },
    { value: 4, label: "Четверг" },
    { value: 5, label: "Пятница" },
    { value: 6, label: "Суббота" },
    { value: 7, label: "Воскресенье" },
  ],
  hint: "Отчёты на один день приходят в одном Excel-файле разными листами.",
};

export const KIND_META: Record<NotificationKind, KindMeta> = {
  low_stock: {
    label: "Низкий остаток",
    description: "Когда покрытие SKU падает до порога — товар скоро закончится.",
    paramSchema: [
      {
        key: "coverage_days_threshold", label: "Порог покрытия",
        type: "number", default: 7, min: 1, max: 60, suffix: "дн",
        hint: "Когда coverage_days SKU становится меньше или равно этому числу",
      },
      DAY_OF_WEEK_PARAM,
    ],
  },
  critical_stock: {
    label: "Критический остаток",
    description: "Совсем мало товара — закупка нужна срочно.",
    paramSchema: [
      {
        key: "coverage_days_threshold", label: "Порог покрытия",
        type: "number", default: 3, min: 1, max: 14, suffix: "дн",
      },
      DAY_OF_WEEK_PARAM,
    ],
  },
  dead_inventory: {
    label: "Неликвид",
    description: "SKU не продаётся — деньги заморожены в товаре. Расчёт по среднему TVelo за последние 30 дней.",
    paramSchema: [
      {
        key: "coverage_days_threshold", label: "Порог покрытия",
        type: "number", default: 180, min: 30, max: 365, suffix: "дн",
        hint: "SKU с coverage больше этого числа = неликвид",
      },
      DAY_OF_WEEK_PARAM,
    ],
  },
  repeated_stockout: {
    label: "Частый out-of-stock",
    description: "SKU регулярно отсутствует — проблема с поставками. Расчёт за последние 30 дней.",
    paramSchema: [
      {
        key: "stockout_days_threshold", label: "Дней OOS",
        type: "number", default: 3, min: 1, max: 30, suffix: "дн",
      },
      DAY_OF_WEEK_PARAM,
    ],
  },
  underestimated_sku: {
    label: "Недооценённый SKU",
    description: "Скорость SKU выше медианы при out-of-stock — недополучаете выручку. Расчёт по среднему TVelo за последние 30 дней.",
    paramSchema: [DAY_OF_WEEK_PARAM],
  },
  sync_error: {
    label: "Ошибка синхронизации",
    description: "Сводка проблем с подключением к API маркетплейса — ключи истекли, ретраи не помогли.",
    paramSchema: [DAY_OF_WEEK_PARAM],
  },
  weekly_report: {
    label: "Сводный отчёт",
    description: "Excel-сводка по всему складу: топ-50 потерь, неликвид, динамика за неделю.",
    paramSchema: [DAY_OF_WEEK_PARAM],
  },
};

const FREQUENCY_OPTIONS: Array<{ value: NotificationFrequency; label: string; hint: string }> = [
  { value: "daily",   label: "Каждый день", hint: "Каждый день — день недели игнорируется" },
  { value: "weekly",  label: "Еженедельно", hint: "Каждую неделю в выбранный день" },
  { value: "monthly", label: "Ежемесячно",  hint: "В первый выбранный день недели каждого месяца" },
];

function frequencyLabel(f: NotificationFrequency): string {
  return FREQUENCY_OPTIONS.find(o => o.value === f)?.label ?? "Еженедельно";
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

  // Фильтруем daily_digest из результатов БД — миграция уже удалила,
  // но enum-value остался. Defense-in-depth на случай старых записей.
  const cleanSubs = subscriptions.filter(s => s.kind in KIND_META);

  const subscribedPairs = new Set(cleanSubs.map(s => `${s.kind}__${s.channel}`));
  const availableToAdd: Array<{ kind: NotificationKind; channel: NotificationChannel }> = [];
  for (const kind of Object.keys(KIND_META) as NotificationKind[]) {
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
          <p className="font-display text-lg text-ink font-medium">У вас пока нет подписок</p>
          <p className="mt-2 text-sm text-ink-muted max-w-md mx-auto">
            Добавьте отчёты чтобы получать Excel-файлы со списками SKU по важным событиям склада.
          </p>
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
          <Icons.ArrowRight size={14} /> Добавить отчёт
        </button>
      ) : (
        <div className="text-xs text-ink-hush text-center py-2">
          Все возможные отчёты уже подписаны
        </div>
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
      if (!res.ok) setError(res.error ?? "ошибка");
      else router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm(`Удалить отчёт «${meta.label}»?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteSubscription(sub.id);
      if (!res.ok) setError(res.error ?? "ошибка");
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
          title={sub.enabled ? "Включено — нажмите чтобы выключить" : "Выключено — нажмите чтобы включить"}
        >
          {sub.enabled && <span className="text-paper text-[14px] leading-none">✓</span>}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display text-base font-medium text-ink">{meta.label}</span>
            <ChannelBadge channel={sub.channel} />
            <FrequencyBadge frequency={currentFreq} />
            {!sub.enabled && (
              <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">— отключено</span>
            )}
          </div>
          <p className="text-xs text-ink-muted mt-1">{meta.description}</p>
          {meta.paramSchema.length > 0 && (
            <div className="mt-2 flex items-center gap-3 flex-wrap text-xs">
              {meta.paramSchema.map(param => {
                // Для daily частоты не показываем day_of_week — он игнорируется worker'ом
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
                <span className="text-ink-hush">Частота:</span> <span className="font-semibold">{frequencyLabel(currentFreq)}</span>
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
            {editing ? "Закрыть" : "Изменить"}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="flex-1 sm:flex-initial text-xs px-3 py-2 rounded-lg border border-rose/30 text-rose hover:bg-rose/5 transition font-medium min-h-[36px]"
            title="Удалить подписку"
          >
            Удалить
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

  // day_of_week disabled при daily частоте — worker всё равно его игнорирует.
  // Сохраняем значение в params чтобы можно было вернуться к weekly/monthly.
  const isDayDisabled = frequency === "daily";

  function handleSave() {
    setError(null);
    setSaving(true);
    startTransition(async () => {
      const res = await upsertSubscription(sub.kind, sub.channel, sub.enabled, params, frequency);
      setSaving(false);
      if (!res.ok) {
        setError(res.error ?? "ошибка сохранения");
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
                {disabled && <span className="ml-1 normal-case text-ink-hush"> · не используется при «каждый день»</span>}
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
          <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-1.5">
            Частота отправки
          </label>
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
          {saving ? "Сохраняется…" : "Сохранить"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 sm:flex-initial px-4 py-2 text-sm border border-line text-ink-muted hover:text-ink hover:bg-paper rounded-lg transition min-h-[40px]"
        >
          Отмена
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
  const [kind, setKind] = useState<NotificationKind>(availableToAdd[0]?.kind ?? "low_stock");
  const [channel, setChannel] = useState<NotificationChannel>(availableToAdd[0]?.channel ?? "email");
  const [frequency, setFrequency] = useState<NotificationFrequency>("weekly");
  const [, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableKinds = Array.from(new Set(availableToAdd.map(a => a.kind))) as NotificationKind[];
  const availableChannelsForKind = availableToAdd
    .filter(a => a.kind === kind)
    .map(a => a.channel);

  useEffect(() => {
    if (!availableChannelsForKind.includes(channel) && availableChannelsForKind.length > 0) {
      setChannel(availableChannelsForKind[0]);
    }
  }, [kind, channel, availableChannelsForKind]);

  const meta = KIND_META[kind];

  function handleAdd() {
    setError(null);
    setSaving(true);
    const params: Record<string, number> = {};
    for (const p of meta.paramSchema) params[p.key] = p.default;

    startTransition(async () => {
      const res = await upsertSubscription(kind, channel, true, params, frequency);
      setSaving(false);
      if (!res.ok) {
        setError(res.error ?? "ошибка");
      } else {
        onAdded();
      }
    });
  }

  return (
    <div className="rounded-2xl border-2 border-lime-deep/40 bg-lime-soft p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-base font-medium text-ink">Новый отчёт</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-ink-hush hover:text-ink text-base px-2 py-1"
          aria-label="Закрыть"
        >
          ✕
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-1.5">
            Тип отчёта
          </label>
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
          <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-1.5">
            Канал доставки
          </label>
          <select
            value={channel}
            onChange={e => setChannel(e.target.value as NotificationChannel)}
            className="w-full px-2 py-2 border border-line rounded-lg bg-paper text-sm focus:outline-none focus:border-lime-deep min-h-[40px]"
          >
            {availableChannelsForKind.map(c => (
              <option key={c} value={c}>{c === "email" ? "Email" : "Telegram"}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-1.5">
            Частота
          </label>
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
      <p className="mt-1 text-[11px] text-ink-hush">
        Параметры (порог, день, частоту) можно изменить после создания. Дефолт — понедельник, еженедельно.
      </p>
      {error && <p className="mt-3 text-xs text-rose font-mono">{error}</p>}
      <div className="mt-4 flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving}
          className="flex-1 sm:flex-initial px-4 py-2.5 text-sm bg-ink text-paper rounded-lg hover:bg-ink-soft disabled:opacity-50 transition font-medium min-h-[44px]"
        >
          {saving ? "Добавляется…" : "Добавить"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 sm:flex-initial px-4 py-2.5 text-sm border border-line text-ink-muted hover:text-ink hover:bg-paper rounded-lg transition min-h-[44px]"
        >
          Отмена
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
