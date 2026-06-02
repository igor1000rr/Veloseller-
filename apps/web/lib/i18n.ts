/**
 * i18n — моно-локаль на сборку.
 *
 * РФ и .com — два отдельных деплоя по одному языку. Поэтому НЕ нужен
 * URL-роутинг локалей (/ru, /en) и React-провайдер: язык фиксируется
 * build-time константой LOCALE (см. lib/features.ts), словарь выбирается
 * статически. t() одинаково работает и в серверных, и в "use client" компонентах.
 *
 * Миграция строк — постепенная: страницы переводим на t() пачками, каждый раз
 * сверяя значение в ru.json с фактическим текстом страницы (чтобы РФ-текст
 * не поехал). Пропущенный ключ возвращается как есть — сразу видно в UI.
 */
import ru from "@/messages/ru.json";
import en from "@/messages/en.json";
import { LOCALE } from "@/lib/features";

type Messages = Record<string, string>;

const CATALOGS: Record<string, Messages> = { ru, en };

const messages: Messages = CATALOGS[LOCALE] ?? ru;

/**
 * Перевод по ключу. Нет ключа → возвращаем сам ключ (явный сигнал, что забыли
 * добавить в словарь). Плейсхолдеры вида {name} подставляются через params.
 *
 *   t("settings.title")
 *   t("warehouse.limit", { limit: 6 })  // "Лимит складов: {limit}"
 */
export function t(key: string, params?: Record<string, string | number>): string {
  let s = messages[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}
