"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icons } from "./Icons";

const nav = [
  { href: "#features", label: "Возможности" },
  { href: "#how", label: "Как работает" },
  { href: "#integrations", label: "Интеграции" },
  { href: "#pricing", label: "Тарифы" },
  { href: "#faq", label: "FAQ" },
];

export default function MobileMenu({ isAuthed = false }: { isAuthed?: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="md:hidden inline-flex items-center justify-center size-10 rounded-lg border border-line bg-paper text-ink hover:bg-bg-soft transition"
        aria-label="Открыть меню"
      >
        <Icons.Menu />
      </button>

      {open && (
        /* КРИТИКА из скрина юзера: было bg-bg — это такой же цвет как body,
           поэтому меню выглядело "прозрачным" и контент за ним просвечивал. Теперь
           bg-paper (белый) + inline-style fallback на случай проблем с Tailwind. */
        <div
          className="fixed inset-0 z-50 md:hidden bg-paper flex flex-col slide-down"
          style={{ backgroundColor: "#ffffff" }}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-paper" style={{ backgroundColor: "#ffffff" }}>
            <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-2.5">
              <Icons.Logo />
              <span className="font-display text-lg font-medium tracking-tight">Veloseller</span>
            </Link>
            <button
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center size-10 rounded-lg border border-line bg-paper text-ink"
              aria-label="Закрыть"
            >
              <Icons.Close />
            </button>
          </div>

          <nav className="flex-1 flex flex-col px-6 py-8 gap-2 overflow-y-auto bg-paper" style={{ backgroundColor: "#ffffff" }}>
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between py-4 border-b border-line text-2xl font-display text-ink hover:text-lime-deep transition"
              >
                <span>{item.label}</span>
                <Icons.ArrowRight size={16} />
              </a>
            ))}
          </nav>

          <div className="px-6 py-6 border-t border-line space-y-3 bg-paper" style={{ backgroundColor: "#ffffff" }}>
            {isAuthed ? (
              <Link
                href={"/dashboard" as any}
                onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-2 w-full rounded-lg bg-ink text-paper px-5 py-3.5 font-semibold"
              >
                В кабинет <Icons.ArrowRight />
              </Link>
            ) : (
              <>
                <Link
                  href={"/register" as any}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center w-full rounded-lg bg-ink text-paper px-5 py-3.5 font-semibold"
                >
                  Начать бесплатно
                </Link>
                <Link
                  href={"/login" as any}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center w-full rounded-lg border border-line bg-paper text-ink px-5 py-3.5 font-medium"
                >
                  Войти
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
