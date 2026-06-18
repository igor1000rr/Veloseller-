/**
 * Централизованные фича-флаги деплоя Veloseller.
 *
 * Один репозиторий — две версии, поведение задаётся env на каждом сервере:
 *   • veloseller.ru (РФ):  LOCALE=ru,  маркетплейсы Ozon+WB,   Telegram off
 *   • *.com (СНГ):         LOCALE=en,  маркетплейсы Amazon+Shopify, Telegram on
 *
 * ⚠️ ВСЕ ДЕФОЛТЫ = текущее поведение РФ-прода. Если переменная не задана —
 *    ничего не меняется. .com задаёт переменные явно в своём билде.
 *
 * NEXT_PUBLIC_* запекаются в сборку (доступны и на клиенте), поэтому каждый
 * деплой собирается со своими значениями — менять в рантайме нельзя, только
 * пересборкой. Это ок: у нас два отдельных билда на двух хостингах.
 */

export type Locale = "ru" | "en";

/** Язык интерфейса. Дефолт ru. Реальное подключение i18n — отдельная фаза. */
export const LOCALE: Locale =
  process.env.NEXT_PUBLIC_LOCALE === "en" ? "en" : "ru";

/**
 * Канонический origin деплоя — для metadataBase, canonical, JSON-LD, sitemap.
 * РФ-дефолт https://veloseller.ru; .com задаёт NEXT_PUBLIC_SITE_URL="https://<домен>".
 * Без хвостового слеша.
 */
export const SITE_URL: string =
  (process.env.NEXT_PUBLIC_SITE_URL || "https://veloseller.ru").replace(/\/+$/, "");

function parseList(v: string | undefined, fallback: string[]): string[] {
  if (v === undefined || v === null || v.trim() === "") return fallback;
  return v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/**
 * Включённые маркетплейс-интеграции. Дефолт — РФ (ozon, wildberries).
 * .com задаст NEXT_PUBLIC_ENABLED_MARKETPLACES="amazon,shopify".
 *
 * Важно: ручные источники (google_sheet, csv, feed) — НЕ маркетплейсы,
 * они доступны на любом деплое и здесь не перечисляются (см. marketplaceOfWarehouseKind).
 */
export const ENABLED_MARKETPLACES: string[] = parseList(
  process.env.NEXT_PUBLIC_ENABLED_MARKETPLACES,
  ["ozon", "wildberries"],
);

/** Radar-модуль. Дефолт включён (РФ). .com может выключить через "false". */
export const RADAR_ENABLED: boolean =
  process.env.NEXT_PUBLIC_RADAR_ENABLED !== "false";

/**
 * Платёжный провайдер. РФ — robokassa (рабочий рублёвый флоу, дефолт).
 * .com — "stub": онлайн-оплаты пока нет, кнопка апгрейда ведёт на mailto,
 * тариф активируется вручную. Международный эквайринг (Paddle/Stripe) —
 * отдельная фаза. .com задаёт NEXT_PUBLIC_PAYMENT_PROVIDER="stub".
 */
export const PAYMENT_PROVIDER: "robokassa" | "stub" =
  process.env.NEXT_PUBLIC_PAYMENT_PROVIDER === "stub" ? "stub" : "robokassa";

/**
 * Промо мобильного приложения: страница /apps, ссылки в шапке/футере/мобменю
 * и секция на главной. Пока приложения нет в сторах — скрыто на ВСЕХ сборках
 * (и РФ, и .com), чтобы не путать маркетплейсы и не обещать того, чего ещё нет.
 * Когда появится листинг — включается явно: NEXT_PUBLIC_APP_PROMO_ENABLED="true".
 */
export const APP_PROMO_ENABLED: boolean =
  process.env.NEXT_PUBLIC_APP_PROMO_ENABLED === "true";

/**
 * К какому маркетплейсу относится тип склада.
 * null = не-маркетплейс (ручной источник: Google Sheet / CSV / фид) — доступен всегда.
 */
export function marketplaceOfWarehouseKind(kind: string): string | null {
  if (kind.startsWith("ozon")) return "ozon";
  if (kind.startsWith("wb")) return "wildberries";
  if (kind.startsWith("amazon")) return "amazon";
  if (kind.startsWith("shopify")) return "shopify";
  return null;
}

export function isMarketplaceEnabled(marketplace: string): boolean {
  return ENABLED_MARKETPLACES.includes(marketplace.toLowerCase());
}

/** Показывать ли этот тип склада в UI. Ручные источники — всегда true. */
export function isWarehouseKindEnabled(kind: string): boolean {
  const mp = marketplaceOfWarehouseKind(kind);
  return mp === null ? true : isMarketplaceEnabled(mp);
}
