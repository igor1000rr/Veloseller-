// Контактные ссылки на мессенджеры Veloseller (MAX + Telegram) — в шапке «для связи».
// Используются в лендинге (_landing/Header), кабинете (AppHeader) и мобильных меню.
// URL живут только здесь, чтобы не расходились между местами вставки.
//
// Display-класс (flex/hidden md:flex и т.п.) передаётся через className:
// у корня его нет, чтобы не конфликтовал с `hidden`.
import { Icons } from "./Icons";

const MAX_URL =
  "https://max.ru/u/f9LHodD0cOLdTY-mgu4RRfH59lh2qM9C0g-betyGC8tX2xfg80K1rZue2vc";
const TELEGRAM_URL = "https://t.me/veloseller1";

export function ContactLinks({ className = "" }: { className?: string }) {
  return (
    <div className={`items-center gap-0.5 ${className}`}>
      <a
        href={MAX_URL}
        target="_blank"
        rel="noopener noreferrer"
        title="MAX"
        aria-label="MAX"
        className="inline-flex items-center justify-center size-9 rounded-lg hover:bg-bg-soft transition"
      >
        <Icons.Max size={20} />
      </a>
      <a
        href={TELEGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        title="Telegram"
        aria-label="Telegram"
        className="inline-flex items-center justify-center size-9 rounded-lg text-ink-soft hover:text-lime-deep hover:bg-bg-soft transition"
      >
        <Icons.Telegram size={18} />
      </a>
    </div>
  );
}
