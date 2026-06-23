"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";
import { TIMEZONES } from "@/lib/timezones";
import { Toggle } from "@/app/_components/Toggle";

type Initial = {
  display_name?: string | null;
  timezone?: string | null;
  telegram_chat_id?: string | null;
  notify_email?: boolean;
  notify_telegram?: boolean;
};

/**
 * Настройки кабинета: Информация (имя + email) · Часовой пояс и уведомления
 * (выпадающий ЧП + тумблеры, как на /account) · Telegram · одна кнопка «Сохранить».
 * Сохраняет всё разом через POST /api/notifications.
 */
export default function SettingsForm({ initial, telegramDeeplink, email }: {
  initial: Initial;
  telegramDeeplink: string | null;
  email?: string | null;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initial.display_name ?? "");
  // Часовой пояс — IANA из общего списка. Незнакомое/старое значение ("UTC+3") → дефолт.
  const knownTz = TIMEZONES.some((tz) => tz.value === initial.timezone);
  const [timezone, setTimezone] = useState(knownTz ? (initial.timezone as string) : "Europe/Moscow");
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

  const sectionCls = "rounded-2xl border border-line bg-paper p-6 space-y-4";
  const headCls = "font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold";
  const inputCls = "w-full rounded-lg border border-line bg-bg-soft px-3 py-2 text-ink focus:bg-paper focus:border-lime-deep focus:outline-none transition text-sm";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ─── Информация ─── */}
      <section className={sectionCls}>
        <h2 className={headCls}>{t("settings.section.info")}</h2>
        <label className="block">
          <span className="block text-sm font-medium text-ink mb-1.5">{t("settings.field.name")}</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t("settings.field.namePlaceholder")}
            className={inputCls}
          />
        </label>
        {email && (
          <div>
            <span className="block text-sm font-medium text-ink mb-1.5">{t("settings.field.email")}</span>
            <div className="w-full rounded-lg border border-line bg-bg-soft px-3 py-2 text-ink-muted text-sm">{email}</div>
          </div>
        )}
      </section>

      {/* ─── Часовой пояс и уведомления ─── */}
      <section className="rounded-2xl border border-line bg-paper p-6 space-y-6">
        <h2 className={headCls}>{t("account.notif.title")}</h2>
        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">{t("account.notif.tzLabel")}</label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className={inputCls}
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
          disabled={saving}
          onChange={setNotifyEmail}
        />
        <Toggle
          label={t("account.notif.tgLabel")}
          description={t("account.notif.tgDesc")}
          checked={notifyTelegram}
          disabled={saving}
          onChange={setNotifyTelegram}
        />
      </section>

      {/* ─── Telegram ─── */}
      <section className={sectionCls}>
        <h2 className={headCls}>Telegram</h2>
        <label className="block">
          <span className="block text-sm font-medium text-ink mb-1.5">{t("settings.telegram.chatIdLabel")}</span>
          <input
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder={t("settings.telegram.chatIdPlaceholder")}
            className={`${inputCls} max-w-xs font-mono`}
          />
        </label>
        {telegramDeeplink ? (
          <a
            href={telegramDeeplink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-lime-soft hover:bg-lime-soft/70 border border-lime-deep/30 text-lime-deep text-sm font-medium transition"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.222l-1.97 9.28c-.148.661-.537.823-1.088.513l-3.005-2.215-1.45 1.394c-.16.16-.295.295-.605.295l.215-3.062 5.572-5.034c.243-.214-.054-.334-.376-.121l-6.888 4.337-2.966-.926c-.645-.202-.657-.645.135-.955l11.586-4.466c.537-.198 1.006.121.84.96z"/></svg>
            {t("settings.telegram.connectAuto")}
          </a>
        ) : (
          <p className="text-xs text-ink-hush">
            {t("settings.telegram.manualHintBefore")}
            <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="text-lime-deep hover:underline">@userinfobot</a>
            {t("settings.telegram.manualHintAfter")}
          </p>
        )}
      </section>

      {/* ─── Сохранить ─── */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-ink text-paper px-5 py-2.5 text-sm font-semibold hover:bg-ink-soft disabled:opacity-50 transition"
        >
          {saving ? t("common.saving") : t("common.save")}
        </button>
        {msg && <span className="text-sm text-ink-muted">{msg}</span>}
      </div>
    </form>
  );
}
