"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Настройки уведомлений и часового пояса.
 * Правки Игоря (раздел 8):
 *  - Часовой пояс по умолчанию UTC+3, с подсказкой "например UTC+4 (MSK+1)..."
 *  - Email — ежедневный обзор (toggle)
 *  - Telegram — ежедневный обзор (toggle)
 */

// Часовые пояса России и СНГ — в формате IANA, метки показывают UTC offset.
// Используется sellers.timezone (IANA string) — pytz.timezone() в worker'е.
const TIMEZONES = [
  { value: "Europe/Kaliningrad", label: "UTC+2 (Калининград)" },
  { value: "Europe/Moscow",      label: "UTC+3 (Москва, Санкт-Петербург)" },
  { value: "Europe/Minsk",       label: "UTC+3 (Минск)" },
  { value: "Europe/Samara",      label: "UTC+4 (Самара, Ижевск)" },
  { value: "Asia/Yekaterinburg", label: "UTC+5 (Екатеринбург, Челябинск, Уфа)" },
  { value: "Asia/Omsk",          label: "UTC+6 (Омск)" },
  { value: "Asia/Krasnoyarsk",   label: "UTC+7 (Красноярск, Новосибирск)" },
  { value: "Asia/Irkutsk",       label: "UTC+8 (Иркутск)" },
  { value: "Asia/Yakutsk",       label: "UTC+9 (Якутск, Чита)" },
  { value: "Asia/Vladivostok",   label: "UTC+10 (Владивосток, Хабаровск)" },
  { value: "Asia/Magadan",       label: "UTC+11 (Магадан)" },
  { value: "Asia/Kamchatka",     label: "UTC+12 (Камчатка)" },
];

export function NotificationSettings({ initial }: {
  initial: { timezone: string; notifyEmail: boolean; notifyTelegram: boolean; sellerId: string };
}) {
  const [timezone, setTimezone] = useState(initial.timezone || "Europe/Moscow");
  const [notifyEmail, setNotifyEmail] = useState(initial.notifyEmail);
  const [notifyTelegram, setNotifyTelegram] = useState(initial.notifyTelegram);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function save(patch: Partial<{ timezone: string; notify_email: boolean; notify_telegram: boolean }>) {
    setBusy(true);
    setStatus("idle");
    setErrMsg(null);
    try {
      const sb = createSupabaseBrowserClient();
      const { error } = await sb.from("sellers").update(patch).eq("id", initial.sellerId);
      if (error) throw error;
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (e: any) {
      setStatus("error");
      setErrMsg(e?.message || "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-paper p-6 space-y-6">
      <div>
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold mb-3">
          Уведомления и часовой пояс
        </h2>
      </div>

      {/* Часовой пояс */}
      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">Часовой пояс</label>
        <select
          value={timezone}
          onChange={(e) => {
            const v = e.target.value;
            setTimezone(v);
            save({ timezone: v });
          }}
          disabled={busy}
          className="w-full rounded-lg border border-line bg-bg-soft px-3 py-2 text-ink focus:bg-paper focus:border-lime-deep focus:outline-none transition text-sm"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz.value} value={tz.value}>{tz.label}</option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-ink-hush">
          Например UTC+4 (MSK+1), UTC+5 (MSK+2) и так далее. По умолчанию — UTC+3 (Москва).
        </p>
      </div>

      {/* Email ежедневный обзор */}
      <ToggleRow
        label="Email — ежедневный обзор"
        description="Получать сводный отчёт по складу на email каждое утро по выбранному часовому поясу."
        checked={notifyEmail}
        disabled={busy}
        onChange={(v) => {
          setNotifyEmail(v);
          save({ notify_email: v });
        }}
      />

      {/* Telegram ежедневный обзор */}
      <ToggleRow
        label="Telegram — ежедневный обзор"
        description="Получать сводный отчёт в Telegram каждое утро. Подключите бота в дашборде."
        checked={notifyTelegram}
        disabled={busy}
        onChange={(v) => {
          setNotifyTelegram(v);
          save({ notify_telegram: v });
        }}
      />

      {/* Статус сохранения */}
      {status === "saved" && (
        <p className="text-xs text-lime-deep font-mono">✓ Сохранено</p>
      )}
      {status === "error" && (
        <p className="text-xs text-rose font-mono">Ошибка: {errMsg}</p>
      )}
    </section>
  );
}

function ToggleRow({ label, description, checked, disabled, onChange }: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink">{label}</div>
        <p className="text-xs text-ink-muted mt-0.5 leading-relaxed">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition focus:outline-none focus:ring-2 focus:ring-lime-deep/40 ${
          checked ? "bg-lime-deep" : "bg-bg-soft border border-line"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <span
          className={`inline-block size-4 transform rounded-full bg-paper shadow transition ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
