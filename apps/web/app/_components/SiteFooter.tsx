// Переиспользуемый footer для /news и /news/[slug]. Главная держит свой inline.

import Link from "next/link";
import { Icons } from "./Icons";

export default function SiteFooter() {
  return (
    <footer className="border-t border-line bg-bg-soft">
      <div className="max-w-[1600px] mx-auto w-full px-4 md:px-8 lg:px-12 py-12 md:py-16">
        <div className="grid grid-cols-2 md:grid-cols-12 gap-8 md:gap-10">
          <div className="col-span-2 md:col-span-4">
            <Link href={"/" as never} className="flex items-center gap-2.5">
              <Icons.Logo />
              <span className="font-display text-xl tracking-tight font-medium">Veloseller</span>
            </Link>
            <p className="mt-5 text-sm text-ink-muted max-w-xs leading-relaxed">
              Управление складом для маркетплейс-селлеров. TVelo, дни покрытия, достоверность
              данных — расчёты, которым можно доверять.
            </p>
          </div>

          <div className="col-span-1 md:col-span-2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">Продукт</div>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link href={"/#features" as never} className="text-ink-soft hover:text-lime-deep transition">
                  Возможности
                </Link>
              </li>
              <li>
                <Link href={"/#how" as never} className="text-ink-soft hover:text-lime-deep transition">
                  Как работает
                </Link>
              </li>
              <li>
                <Link href={"/#pricing" as never} className="text-ink-soft hover:text-lime-deep transition">
                  Тарифы
                </Link>
              </li>
              <li>
                <Link href={"/#faq" as never} className="text-ink-soft hover:text-lime-deep transition">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          <div className="col-span-1 md:col-span-2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">Ресурсы</div>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link href={"/news" as never} className="text-ink-soft hover:text-lime-deep transition">
                  Новости и гайды
                </Link>
              </li>
              <li>
                <Link href={"/login" as never} className="text-ink-soft hover:text-lime-deep transition">
                  Войти
                </Link>
              </li>
              <li>
                <Link href={"/register" as never} className="text-ink-soft hover:text-lime-deep transition">
                  Регистрация
                </Link>
              </li>
            </ul>
          </div>

          <div className="col-span-1 md:col-span-2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">Контакты</div>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <a href="mailto:info@proaim.ru" className="text-ink-soft hover:text-lime-deep transition">
                  info@proaim.ru
                </a>
              </li>
              <li>
                <Link href={"/privacy" as never} className="text-ink-soft hover:text-lime-deep transition">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href={"/terms" as never} className="text-ink-soft hover:text-lime-deep transition">
                  Terms
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 md:mt-12 pt-6 md:pt-8 border-t border-line flex flex-wrap items-center justify-between gap-4">
          <div className="font-mono text-xs text-ink-hush">
            © {new Date().getFullYear()} Veloseller — управление складом для ecommerce
          </div>
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-lime-deep animate-pulse" />
            <span className="font-mono text-xs text-ink-hush">все системы работают</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
