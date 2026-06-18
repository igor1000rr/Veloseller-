"use client";

import { useEffect } from "react";
import Link from "next/link";
import type { ParsedError } from "@/lib/error-parser";
import { t } from "@/lib/i18n";

/**
 * Popup-модал для отображения ошибок и важных уведомлений.
 *
 * Закрывается по Escape, клику вне модала, кнопке закрытия.
 * Поддерживает action-кнопку (Link на /billing для sku_limit, etc.)
 * + опциональный raw-блок (collapsible details для debug).
 */
export function ErrorModal({
  error,
  onClose,
}: {
  error: ParsedError | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!error) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Блокируем scroll за модалом
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = original;
    };
  }, [error, onClose]);

  if (!error) return null;

  // Цвет акцента в зависимости от типа
  const accent = pickAccent(error.kind);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="error-modal-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" />

      {/* Modal */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-w-md w-full bg-paper border border-line rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header с цветной полоской сверху */}
        <div className={`h-1 ${accent.bar}`} />

        <div className="p-6">
          {/* Icon */}
          <div className={`size-12 rounded-full ${accent.bg} flex items-center justify-center mb-4`}>
            <svg className={`size-6 ${accent.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {error.kind === "sku_limit" ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              ) : error.kind === "auth_failed" || error.kind === "permission" ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              ) : error.kind === "marketplace_down" || error.kind === "network" ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              )}
            </svg>
          </div>

          {/* Title */}
          <h2 id="error-modal-title" className="font-display text-2xl tracking-tight font-medium text-ink mb-2">
            {error.title}
          </h2>

          {/* Message */}
          <p className="text-ink-muted leading-relaxed">{error.message}</p>

          {/* Raw error (collapsible) */}
          {error.raw && error.raw !== error.message && (
            <details className="mt-4 group">
              <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-ink-hush hover:text-ink transition select-none">
                {t("common.techDetails")}
              </summary>
              <pre className="mt-2 p-3 bg-bg-soft border border-line rounded text-[11px] text-ink-muted font-mono overflow-x-auto whitespace-pre-wrap break-all">
                {error.raw}
              </pre>
            </details>
          )}

          {/* Actions */}
          <div className="mt-6 flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-mono uppercase tracking-wider border border-line rounded-lg hover:bg-bg-soft transition"
            >
              {t("common.close")}
            </button>
            {error.action && (
              <Link
                href={error.action.href as any}
                onClick={onClose}
                className={`px-4 py-2 text-sm font-mono uppercase tracking-wider rounded-lg ${accent.btn} text-paper transition`}
              >
                {error.action.label}
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function pickAccent(kind: ParsedError["kind"]) {
  switch (kind) {
    case "sku_limit":
      return { bar: "bg-orange", bg: "bg-orange/10", icon: "text-orange", btn: "bg-ink hover:bg-ink-soft" };
    case "auth_failed":
    case "permission":
      return { bar: "bg-rose", bg: "bg-rose/10", icon: "text-rose", btn: "bg-rose hover:opacity-90" };
    case "marketplace_down":
    case "network":
      return { bar: "bg-orange", bg: "bg-orange/10", icon: "text-orange", btn: "bg-ink hover:bg-ink-soft" };
    case "rate_limit":
      return { bar: "bg-orange", bg: "bg-orange/10", icon: "text-orange", btn: "bg-ink hover:bg-ink-soft" };
    case "validation":
      return { bar: "bg-orange", bg: "bg-orange/10", icon: "text-orange", btn: "bg-ink hover:bg-ink-soft" };
    default:
      return { bar: "bg-rose", bg: "bg-rose/10", icon: "text-rose", btn: "bg-ink hover:bg-ink-soft" };
  }
}
