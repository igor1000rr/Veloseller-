/**
 * i18n — моно-локаль на сборку.
 *
 * РФ и .com — два отдельных деплоя по одному языку. Поэтому НЕ нужен
 * URL-роутинг локалей (/ru, /en) и React-провайдер: язык фиксируется
 * build-time константой LOCALE (см. lib/features.ts), словарь выбирается
 * статически. t() одинаково работает и в серверных, и в "use client" компонентах.
 *
 * Словари разбиты по неймспейсам (messages/{ru,en}/<namespace>.json) и
 * склеиваются здесь spread'ом. При миграции страницы ключи добавляются только
 * в свой неймспейс — пуш маленький, общий словарь целиком больше не трогаем.
 * Ключи плоские с префиксом неймспейса ("dashboard.title"), коллизий между
 * файлами нет. Пропущенный ключ возвращается как есть — сразу видно в UI.
 */
import ruCommon from "@/messages/ru/common.json";
import ruNav from "@/messages/ru/nav.json";
import ruAuth from "@/messages/ru/auth.json";
import ruSettings from "@/messages/ru/settings.json";
import ruError from "@/messages/ru/error.json";
import ruUnit from "@/messages/ru/unit.json";
import ruDashboard from "@/messages/ru/dashboard.json";
import ruReport from "@/messages/ru/report.json";
import ruSku from "@/messages/ru/sku.json";
import ruAccount from "@/messages/ru/account.json";
import ruDynamics from "@/messages/ru/dynamics.json";
import ruChangelog from "@/messages/ru/changelog.json";
import ruSubs from "@/messages/ru/subs.json";
import enCommon from "@/messages/en/common.json";
import enNav from "@/messages/en/nav.json";
import enAuth from "@/messages/en/auth.json";
import enSettings from "@/messages/en/settings.json";
import enError from "@/messages/en/error.json";
import enUnit from "@/messages/en/unit.json";
import enDashboard from "@/messages/en/dashboard.json";
import enReport from "@/messages/en/report.json";
import enSku from "@/messages/en/sku.json";
import enAccount from "@/messages/en/account.json";
import enDynamics from "@/messages/en/dynamics.json";
import enChangelog from "@/messages/en/changelog.json";
import enSubs from "@/messages/en/subs.json";
import { LOCALE } from "@/lib/features";

type Messages = Record<string, string>;

const ru: Messages = { ...ruCommon, ...ruNav, ...ruAuth, ...ruSettings, ...ruError, ...ruUnit, ...ruDashboard, ...ruReport, ...ruSku, ...ruAccount, ...ruDynamics, ...ruChangelog, ...ruSubs };
const en: Messages = { ...enCommon, ...enNav, ...enAuth, ...enSettings, ...enError, ...enUnit, ...enDashboard, ...enReport, ...enSku, ...enAccount, ...enDynamics, ...enChangelog, ...enSubs };

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

/**
 * Множественное число. Берёт формы из словаря по ключам `${baseKey}.one|few|many|other`.
 *   ru: one/few/many (1 день / 2 дня / 5 дней)
 *   en: one/other     (1 day / 2 days)
 * Возвращает только слово-форму (без числа) — число подставляйте сами.
 *
 *   `${n} ${plural(n, "unit.days")}`  // ru: "5 дней", en: "5 days"
 */
export function plural(n: number, baseKey: string): string {
  const pick = (suffix: string) => messages[`${baseKey}.${suffix}`];
  if (LOCALE === "ru") {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return pick("one") ?? baseKey;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return pick("few") ?? pick("many") ?? baseKey;
    return pick("many") ?? pick("few") ?? baseKey;
  }
  return (n === 1 ? pick("one") : pick("other")) ?? pick("one") ?? baseKey;
}
