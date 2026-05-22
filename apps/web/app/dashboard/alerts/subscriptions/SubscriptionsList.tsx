"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../../_components/Icons";
import {
  upsertSubscription,
  deleteSubscription,
  toggleSubscription,
  type NotificationKind,
  type NotificationChannel,
} from "./actions";

/**
 * Метаданные типов уведомлений: лейблы, описания, конфигурация параметров.
 * Источник истины для UI — определяет какие поля показывать в форме редактирования.
 */
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

export const KIND_META: Record<NotificationKind, KindMeta> = {
  low_stock: {
    label: "Низкий остаток",
    description: "Когда покрытие SKU падает до порога — товар скоро закончится.",
    paramSchema: [{
      key: "coverage_days_threshold", label: "Порог покрытия",
      type: "number", default: 7, min: 1, max: 60, suffix: "дн",
      hint: "Когда coverage_days SKU становится меньше или равно этому числу",
    }],
  },
  critical_stock: {
    label: "Критический остаток",
    description: "Совсем мало товара — закупка нужна срочно.",
    paramSchema: [{
      key: "coverage_days_threshold", label: "Порог покрытия",
      type: "number", default: 3, min: 1, max: 14, suffix: "дн",
    }],
  },
  dead_inventory: {
    label: "Неликвид",
    description: "SKU не продаётся — деньги заморожены в товаре.",
    paramSchema: [{
      key: "coverage_days_threshold", label: "Порог покрытия",
      type: "number", default: 180, min: 30, max: 365, suffix: "дн",
      hint: "SKU с coverage больше этого числа = неликвид",
    }],
  },
  repeated_stockout: {
    label: "Частый out-of-stock",
    description: "SKU регулярно отсутствует — проблема с поставками.",
    paramSchema: [{
      key: "stockout_days_threshold", label: "Дней OOS",
      type: "number", default: 3, min: 1, max: 30, suffix: "дн",
    }],
  },
  underestimated_sku: {
    label: "Недооценённый SKU",
    description: "Скорость SKU выше медианы при out-of-stock — недополучаете выручку.",
    paramSchema: [],
  },
  sync_error: {
    label: "Ошибка синхронизации",
    description: "Когда API маркетплейса не отвечает или ключи истекли.",
    paramSchema: [],
  },
  weekly_report: {
    label: "Еженедельный отчёт",
    description: "Excel с топ-50 потерь, неликвидом и динамикой за неделю.",
    paramSchema: [{
      key: "day_of_week", label: "День недели",
      type: "select", default: 1,
      options: [
        { value: 1, label: "Понедельник" },
        { value: 2, label: "Вторник" },
        { value: 3, label: "Среда" },
        { value: 4, label: "Четверг" },
        { value: 5, label: "Пятница" },
        { value: 6, label: "Суббота" },
        { value: 7, label: "Воскресенье" },
      ],
    }],
  },
  daily_digest: {
    label: "Ежедневный обзор",
    description: "Сводка важных событий за сутки одним письмом.",
    paramSchema: [{
      key: "hour_local", label: "Час отправки",
      type: "number", default: 9, min: 0, max: 23, suffix: ":00",
      hint: "По часовому поясу профиля",
    }],
  },
};

export type Subscription = {
  id: string;
  kind: NotificationKind;
  channel: NotificationChannel;
  enabled: boolean;
  params: Record<string, any>;
  created_at: string;
};

/**
 * Список существующих подписок + кнопка добавить новую.
 * Каждая подписка раскрывается в форму редактирования (collapse).
 */
export function SubscriptionsList({ subscriptions }: { subscriptions: Subscription[] }) {
  const [adding, setAdding] = useState(false);
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Какие kinds ещё не подписаны — их можно добавить
  const subscribedPairs = new Set(subscriptions.map(s => `${s.kind}__${s.channel}`));
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
      {subscriptions.length === 0 && !adding && (
        <div className="rounded-2xl border border-line bg-paper p-8 md:p-10 text-center">
          <p className="font-display text-lg text-ink font-medium">У вас пока нет подписок</p>
          <p className="mt-2 text-sm text-ink-muted max-w-md mx-auto">
            Добавьте уведомления чтобы получать оповещения о важных событиях по складу.
          </p>
        </div>
      )}

      {subscriptions.map(sub => (
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
          className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-paper p-4 text-ink-muted hover:text-ink hover:border-lime-deep/40 hover:bg-bg-soft transition font-medium"
        >
          <Icons.ArrowRight size={14} /> Добавить уведомление
        </button>
      ) : (
        <div className="text-xs text-ink-hush text-center py-2">
          Все возможные уведомления уже подписаны
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

  function handleToggle() {
    setError(null);
    startTransition(async () => {
      const res = await toggleSubscription(sub.id, !sub.enabled);
      if (!res.ok) setError(res.error ?? "ошибка");
      else router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm(`Удалить уведомление "${meta.label}"?`)) return;
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
      <div className="p-4 flex items-start gap-3 flex-wrap">
        {/* Переключатель enabled */}
        <button
          type="button"
          onClick={handleToggle}
          className={`shrink-0 mt-1 size-5 rounded border flex items-center justify-center transition ${
            sub.enabled ? "bg-lime-deep border-lime-deep" : "bg-paper border-line hover:border-ink-muted"
          }`}
          title={sub.enabled ? "Включено — нажмите чтобы выключить" : "Выключено — нажмите чтобы включить"}
        >
          {sub.enabled && <span className="text-paper text-[12px] leading-none">✓</span>}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display text-base font-medium text-ink">{meta.label}</span>
            <ChannelBadge channel={sub.channel} />
            {!sub.enabled && (
              <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">— отключено</span>
            )}
          </div>
          <p className="text-xs text-ink-muted mt-1">{meta.description}</p>
          {meta.paramSchema.length > 0 && (
            <div className="mt-2 flex items-center gap-3 flex-wrap text-xs">
              {meta.paramSchema.map(param => {
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
            </div>
          )}
          {error && (
            <p className="mt-2 text-xs text-rose font-mono">{error}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {meta.paramSchema.length > 0 && (
            <button
              type="button"
              onClick={() => setEditing(e => !e)}
              className="text-xs px-3 py-1.5 rounded-lg border border-line text-ink-muted hover:text-ink hover:bg-bg-soft transition font-medium"
            >
              {editing ? "Закрыть" : "Изменить"}
            </button>
          )}
          <button
            type="button"
            onClick={handleDelete}
            className="text-xs px-3 py-1.5 rounded-lg border border-rose/30 text-rose hover:bg-rose/5 transition font-medium"
            title="Удалить подписку"
          >
            Удалить
          </button>
        </div>
      </div>

      {editing && meta.paramSchema.length > 0 && (
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
  const [, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    setSaving(true);
    startTransition(async () => {
      const res = await upsertSubscription(sub.kind, sub.channel, sub.enabled, params);
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
    <div className="border-t border-line p-4 bg-bg-soft">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {meta.paramSchema.map(p => (
          <div key={p.key}>
            <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-1.5">
              {p.label}
            </label>
            {p.type === "select" && p.options ? (
              <select
                value={params[p.key]}
                onChange={e => setParams({ ...params, [p.key]: parseInt(e.target.value, 10) })}
                className="w-full px-2 py-1.5 border border-line rounded-lg bg-paper text-sm focus:outline-none focus:border-lime-deep"
              >
                {p.options.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={params[p.key]}
                  min={p.min}
                  max={p.max}
                  onChange={e => setParams({ ...params, [p.key]: parseInt(e.target.value, 10) || 0 })}
                  className="w-full px-2 py-1.5 border border-line rounded-lg bg-paper font-mono text-sm focus:outline-none focus:border-lime-deep"
                />
                {p.suffix && <span className="text-xs text-ink-muted">{p.suffix}</span>}
              </div>
            )}
            {p.hint && <p className="mt-1 text-[11px] text-ink-hush">{p.hint}</p>}
          </div>
        ))}
      </div>
      {error && <p className="mt-3 text-xs text-rose font-mono">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 text-sm bg-ink text-paper rounded-lg hover:bg-ink-soft disabled:opacity-50 transition font-medium"
        >
          {saving ? "Сохраняется…" : "Сохранить"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-sm border border-line text-ink-muted hover:text-ink hover:bg-paper rounded-lg transition"
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
  const [, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Доступные комбинации kind+channel
  const availableKinds = Array.from(new Set(availableToAdd.map(a => a.kind))) as NotificationKind[];
  const availableChannelsForKind = availableToAdd
    .filter(a => a.kind === kind)
    .map(a => a.channel);

  // Если выбранный channel не доступен для kind — переключаем на первый доступный
  if (!availableChannelsForKind.includes(channel) && availableChannelsForKind.length > 0) {
    setChannel(availableChannelsForKind[0]);
  }

  const meta = KIND_META[kind];

  function handleAdd() {
    setError(null);
    setSaving(true);
    const params: Record<string, number> = {};
    for (const p of meta.paramSchema) params[p.key] = p.default;

    startTransition(async () => {
      const res = await upsertSubscription(kind, channel, true, params);
      setSaving(false);
      if (!res.ok) {
        setError(res.error ?? "ошибка");
      } else {
        onAdded();
      }
    });
  }

  return (
    <div className="rounded-2xl border-2 border-lime-deep/40 bg-lime-soft p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-base font-medium text-ink">Новое уведомление</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-ink-hush hover:text-ink text-sm"
        >
          ✕
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-1.5">
            Тип уведомления
          </label>
          <select
            value={kind}
            onChange={e => setKind(e.target.value as NotificationKind)}
            className="w-full px-2 py-1.5 border border-line rounded-lg bg-paper text-sm focus:outline-none focus:border-lime-deep"
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
            className="w-full px-2 py-1.5 border border-line rounded-lg bg-paper text-sm focus:outline-none focus:border-lime-deep"
          >
            {availableChannelsForKind.map(c => (
              <option key={c} value={c}>{c === "email" ? "Email" : "Telegram"}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-muted">{meta.description}</p>
      {meta.paramSchema.length > 0 && (
        <p className="mt-1 text-[11px] text-ink-hush">
          Параметры по умолчанию можно изменить после создания.
        </p>
      )}
      {error && <p className="mt-3 text-xs text-rose font-mono">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving}
          className="px-4 py-2 text-sm bg-ink text-paper rounded-lg hover:bg-ink-soft disabled:opacity-50 transition font-medium"
        >
          {saving ? "Добавляется…" : "Добавить"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm border border-line text-ink-muted hover:text-ink hover:bg-paper rounded-lg transition"
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
