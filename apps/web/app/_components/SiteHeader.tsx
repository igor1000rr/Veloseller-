// Переиспользуемый header для публичных страниц (/news, /news/[slug]).
// Главная продолжает использовать свой inline header в page.tsx — не ломаем.

import Link from "next/link";
import { Icons } from "./Icons";
import MobileMenu from "./MobileMenu";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function SiteHeader() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAuthed = !!user;

  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-bg/85 border-b border-line">
      <div className="w-full px-4 md:px-8 lg:px-12 py-3 md:py-4 flex items-center justify-between gap-4">
        <Link href={"/" as never} className="flex items-center gap-2.5 shrink-0">
          <Icons.Logo />
          <span className="font-display text-lg font-medium tracking-tight">
            Velo<span className="text-lime-deep">seller</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-7">
          <Link href={"/#features" as never} className="text-sm text-ink-soft hover:text-lime-deep transition">
            Возможности
          </Link>
          <Link href={"/#how" as never} className="text-sm text-ink-soft hover:text-lime-deep transition">
            Как работает
          </Link>
          <Link href={"/#pricing" as never} className="text-sm text-ink-soft hover:text-lime-deep transition">
            Тарифы
          </Link>
          <Link href={"/news" as never} className="text-sm text-lime-deep font-medium">
            Новости
          </Link>
          <Link href={"/#faq" as never} className="text-sm text-ink-soft hover:text-lime-deep transition">
            FAQ
          </Link>
        </nav>

        <div className="flex items-center gap-2 md:gap-3">
          {isAuthed ? (
            <Link
              href={"/dashboard" as never}
              className="hidden md:inline-flex items-center gap-2 rounded-lg bg-ink text-paper px-4 py-2 text-sm font-semibold hover:bg-ink-soft transition"
            >
              В кабинет <Icons.ArrowRight size={12} />
            </Link>
          ) : (
            <>
              <Link
                href={"/login" as never}
                className="hidden md:inline-block text-sm text-ink-soft hover:text-ink transition px-2 py-1"
              >
                Войти
              </Link>
              <Link
                href={"/register" as never}
                className="hidden md:inline-flex rounded-lg bg-ink text-paper px-4 py-2 text-sm font-semibold hover:bg-ink-soft transition"
              >
                Начать
              </Link>
            </>
          )}
          <MobileMenu isAuthed={isAuthed} />
        </div>
      </div>
    </header>
  );
}
