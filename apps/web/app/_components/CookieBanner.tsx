"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { t } from "@/lib/i18n";

const STORAGE_KEY = "veloseller-cookie-consent";
const CONSENT_VERSION = "v1";

type ConsentValue = "accepted" | "rejected" | null;

/**
 * GDPR cookie consent banner. Показывается, пока пользователь не сделал выбор.
 *
 * Выбор сохраняется в localStorage. "accepted" — разрешает analytics cookies,
 * "rejected" — только essential (auth, CSRF) cookies.
 *
 * Версия консента (`CONSENT_VERSION`) позволяет переспросить пользователя при
 * существенном изменении политики (просто увеличить версию).
 *
 * Тексты — через i18n (t), чтобы на .com баннер был на английском, на .ru — на русском.
 */
export function CookieBanner() {
  const [consent, setConsent] = useState<ConsentValue>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Если консент устарел — переспрашиваем
        if (parsed.version === CONSENT_VERSION) {
          setConsent(parsed.value);
        }
      }
    } catch {
      // localStorage недоступен или повреждён — показываем баннер
    }
  }, []);

  const setChoice = (value: "accepted" | "rejected") => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ value, version: CONSENT_VERSION, ts: new Date().toISOString() })
      );
    } catch {
      // ignore
    }
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
