"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";
import { TIMEZONES } from "@/lib/timezones";
import { Toggle } from "@/app/_components/Toggle";

/**
 * Настройки уведомлений и часового пояса (/account). Автосохранение на каждое
 * изменение. Тот же визуал и список ЧП использует /dashboard/settings.
 */
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
      <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold">{t("account.notif.title")}</h2>

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

      <Toggle
        label={t("account.notif.emailLabel")}
        description={t("account.notif.emailDesc")}
        checked={notifyEmail}
        disabled={busy}
        onChange={(v) => { setNotifyEmail(v); save({ notify_email: v }); }}
      />

      <Toggle
        label={t("account.notif.tgLabel")}
        description={t("account.notif.tgDesc")}
        checked={notifyTelegram}
        disabled={busy}
        onChange={(v) => { setNotifyTelegram(v); save({ notify_telegram: v }); }}
      />

      {status === "saved" && (
        <p className="text-xs text-lime-deep font-mono">{t("account.notif.saved")}</p>
      )}
      {status === "error" && (
        <p className="text-xs text-rose font-mono">{t("account.notif.errPrefix")} {errMsg}</p>
      )}
    </section>
  );
}
