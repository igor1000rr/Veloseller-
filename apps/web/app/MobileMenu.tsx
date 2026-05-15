"use client";
import Link from "next/link";
import { useState } from "react";

const nav = [
  { href: "#features",     label: "Возможности" },
  { href: "#how",          label: "Как работает" },
  { href: "#integrations", label: "Интеграции" },
  { href: "#pricing",      label: "Тарифы" },
  { href: "#faq",          label: "FAQ" },
];

export default function MobileMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label="Меню"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex size-10 items-center justify-center rounded-md border border-line hover:border-lime-deep/40 transition"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          {open ? (
            <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          ) : (
            <path d="M2 5h14M2 9h14M2 13h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          )}
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 top-[var(--header-h,64px)] z-20 bg-paper/95 backdrop-blur-md border-t border-line animate-[fade-up_.2s_ease]"
          onClick={() => setOpen(false)}
        >
          <nav className="flex flex-col p-6 gap-1">
            {nav.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="flex items-center justify-between rounded-lg px-4 py-3.5 text-ink text-base hover:bg-bg-soft transition"
              >
                <span>{n.label}</span>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-ink-hush">
                  <path d="M1 7h12m0 0L8 2m5 5l-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            ))}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link href={"/login" as any} className="rounded-lg border border-line px-4 py-3 text-center text-ink-soft font-medium hover:border-lime-deep/40 transition">
                Войти
              </Link>
              <Link href={"/register" as any} className="rounded-lg bg-ink text-paper px-4 py-3 text-center font-semibold hover:bg-ink-soft transition">
                Начать
              </Link>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
