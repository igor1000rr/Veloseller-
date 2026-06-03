"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";

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
  { value: "Europe/Kaliningrad", label: t("account.tz.kaliningrad") },
  { value: "Europe/Moscow",      label: t("account.tz.moscow") },
  { value: "Europe/Minsk",       label: t("account.tz.minsk") },
  { value: "Europe/Samara",      label: t("account.tz.samara") },
  { value: "Asia/Yekaterinburg", label: t("account.tz.yekaterinburg") },
  { value: "Asia/Omsk",          label: t("account.tz.omsk") },
  { value: "Asia/Krasnoyarsk",   label: t("account.tz.krasnoyarsk") },
  { value: "Asia/Irkutsk",       label: t("account.tz.irkutsk") },
  { value: "Asia/Yakutsk",       label: t("account.tz.yakutsk") },
  { value: "Asia/Vladivostok",   label: t("account.tz.vladivostok") },
  { value: "Asia/Magadan",       label: t("account.tz.magadan") },
  { value: "Asia/Kamchatka",     label: t("account.tz.kamchatka") },
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
      setErrMsg(e?.message || t("account.notif.errSave"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-paper p-6 space-y-6">
      <div>
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold mb-3">{t("account.notif.title")}</h2>
      </div>

      {/* Часовой пояс */}
      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">{t("account.notif.tzLabel")}</label>
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
        <p className="mt-1.5 text-xs text-ink-hush">{t("account.notif.tzHint")}</p>
      </div>

      {/* Email ежедневный обзор */}
      <ToggleRow
        label={t("account.notif.emailLabel")}
        description={t("account.notif.emailDesc")}
        checked={notifyEmail}
        disabled={busy}
        onChange={(v) => {
          setNotifyEmail(v);
          save({ notify_email: v });
        }}
      />

      {/* Telegram ежедневный обзор */}
      <ToggleRow
        label={t("account.notif.tgLabel")}
        description={t("account.notif.tgDesc")}
        checked={notifyTelegram}
        disabled={busy}
        onChange={(v) => {
          setNotifyTelegram(v);
          save({ notify_telegram: v });
        }}
      />

      {/* Статус сохранения */}
      {status === "saved" && (
        <p className="text-xs text-lime-deep font-mono">{t("account.notif.saved")}</p>
      )}
      {status === "error" && (
        <p className="text-xs text-rose font-mono">{t("account.notif.errPrefix")} {errMsg}</p>
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
