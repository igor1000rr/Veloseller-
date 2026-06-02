"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";

type Initial = {
  display_name?: string | null;
  timezone?: string | null;
  telegram_chat_id?: string | null;
  notify_email?: boolean;
  notify_telegram?: boolean;
};

export default function SettingsForm({ initial, telegramDeeplink }: { initial: Initial; telegramDeeplink: string | null }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initial.display_name ?? "");
  const [timezone, setTimezone] = useState(initial.timezone ?? "UTC");
  const [chatId, setChatId] = useState(initial.telegram_chat_id ?? "");
  const [notifyEmail, setNotifyEmail] = useState(initial.notify_email ?? true);
  const [notifyTelegram, setNotifyTelegram] = useState(initial.notify_telegram ?? true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: displayName || null,
        timezone,
        telegram_chat_id: chatId || null,
        notify_email: notifyEmail,
        notify_telegram: notifyTelegram,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setMsg(t("settings.saved"));
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setMsg(t("settings.saveError", { error: data.error ?? res.statusText }));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-white border border-slate-200 rounded-2xl p-6">
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">{t("settings.section.profile")}</h2>
        <label className="block mb-3">
          <span className="block text-sm font-medium text-slate-700 mb-1">{t("settings.field.name")}</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t("settings.field.namePlaceholder")}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">{t("settings.field.timezone")}</span>
          <input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder={t("settings.field.timezonePlaceholder")}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <span className="text-xs text-slate-500 mt-1 block">
            {t("settings.field.timezoneHint")}
          </span>
        </label>
      </section>

      <hr className="border-slate-200" />

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">{t("settings.section.notifications")}</h2>

        <label className="flex items-center gap-3 mb-3 cursor-pointer">
          <input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)}
                 className="w-4 h-4 accent-violet-600" />
          <span className="text-sm text-slate-700">{t("settings.notify.email")}</span>
        </label>

        <label className="flex items-center gap-3 mb-3 cursor-pointer">
          <input type="checkbox" checked={notifyTelegram} onChange={(e) => setNotifyTelegram(e.target.checked)}
                 className="w-4 h-4 accent-violet-600" />
          <span className="text-sm text-slate-700">{t("settings.notify.telegram")}</span>
        </label>

        <label className="block ml-7">
          <span className="block text-xs text-slate-600 mb-1">{t("settings.telegram.chatIdLabel")}</span>
          <input
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder={t("settings.telegram.chatIdPlaceholder")}
            className="w-full max-w-xs px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          {telegramDeeplink ? (
            <a href={telegramDeeplink} target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-2 mt-2 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 rounded-lg text-sm font-medium">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.222l-1.97 9.28c-.148.661-.537.823-1.088.513l-3.005-2.215-1.45 1.394c-.16.16-.295.295-.605.295l.215-3.062 5.572-5.034c.243-.214-.054-.334-.376-.121l-6.888 4.337-2.966-.926c-.645-.202-.657-.645.135-.955l11.586-4.466c.537-.198 1.006.121.84.96z"/></svg>
              {t("settings.telegram.connectAuto")}
            </a>
          ) : (
            <span className="text-xs text-slate-500 mt-1 block">
              {t("settings.telegram.manualHintBefore")}<a href="https://t.me/userinfobot" target="_blank" className="text-violet-600 hover:underline">@userinfobot</a>{t("settings.telegram.manualHintAfter")}
            </span>
          )}
        </label>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-medium px-5 py-2 rounded-lg"
        >
          {saving ? t("common.saving") : t("common.save")}
        </button>
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
      </div>
    </form>
  );
}
