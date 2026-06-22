"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { t } from "@/lib/i18n";
import { getStoredConsent, setConsentChoice, type ConsentValue } from "@/lib/consent";

/**
 * Cookie consent banner (152-ФЗ / GDPR). Показывается, пока пользователь не сделал выбор.
 *
 * Выбор сохраняется в localStorage. "accepted" — разрешает аналитику
 * (Яндекс.Метрика), "rejected" — только essential (auth, CSRF) cookies.
 * При выборе диспатчится событие (см. lib/consent) — Метрика стартует/не
 * стартует вживую, без перезагрузки.
 *
 * Версия консента (`CONSENT_VERSION` в lib/consent) позволяет переспросить
 * пользователя при существенном изменении политики (просто увеличить версию).
 *
 * Тексты — через i18n (t), чтобы на .com баннер был на английском, на .ru — на русском.
 */
export function CookieBanner() {
  const [consent, setConsent] = useState<ConsentValue>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setConsent(getStoredConsent());
  }, []);

  const setChoice = (value: "accepted" | "rejected") => {
    setConsentChoice(value);
    setConsent(value);
  };

  // SSR / hydration: не рендерим до маунта
  if (!mounted) return null;
  // Уже сделал выбор
  if (consent !== null) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-paper shadow-lg"
    >
      <div className="max-w-4xl mx-auto px-6 py-4 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1 text-sm text-ink-muted">
          <p>
            {t("cookie.text")}{" "}
            <Link href="/privacy" className="underline hover:text-ink">{t("cookie.privacyLink")}</Link>.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setChoice("rejected")}
            className="px-4 py-2 text-sm font-mono uppercase tracking-wider border border-line rounded hover:bg-bg-soft"
          >
            {t("cookie.reject")}
          </button>
          <button
            onClick={() => setChoice("accepted")}
            className="px-4 py-2 text-sm font-mono uppercase tracking-wider border border-ink bg-ink text-paper rounded hover:opacity-90"
          >
            {t("cookie.accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
