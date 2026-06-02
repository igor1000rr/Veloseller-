/**
 * Парсер ошибок API → человеческое сообщение для UI.
 *
 * Разбирает разные форматы ошибок (наши + Supabase + Ozon + WB) и приводит
 * к единому типу ParsedError с заголовком, текстом и действием.
 */

import { t } from "@/lib/i18n";

export type ErrorKind =
  | "sku_limit"           // достигнут лимит SKU тарифа
  | "auth_failed"         // неверные креденшелы маркетплейса
  | "marketplace_down"    // маркетплейс не отвечает (5xx)
  | "rate_limit"          // превышен rate limit
  | "network"             // нет сети / timeout
  | "validation"          // невалидные входные данные
  | "permission"          // нет прав доступа (401/403 у нас)
  | "unknown";

export type ParsedError = {
  kind: ErrorKind;
  title: string;
  message: string;
  action?: { label: string; href: string };
  raw?: string;  // оригинальная строка для debug (показывается в развёрнутом виде)
};

/**
 * Извлекает строку ошибки из произвольной структуры (наш формат, JSON-string,
 * вложенные detail/error/message).
 */
function extractErrorText(input: unknown): string {
  if (!input) return "";
  if (typeof input === "string") {
    // Иногда сервер отдаёт уже JSON-строку как поле
    if (input.startsWith("{") || input.startsWith("[")) {
      try {
        return extractErrorText(JSON.parse(input));
      } catch {
        return input;
      }
    }
    return input;
  }
  if (typeof input === "object") {
    const obj = input as any;
    // FastAPI: { detail: "..." } или { detail: { message: "..." } }
    if (typeof obj.detail === "string") return extractErrorText(obj.detail);
    if (obj.detail && typeof obj.detail === "object") return extractErrorText(obj.detail);
    // Supabase / generic: { error: "..." }
    if (typeof obj.error === "string") return extractErrorText(obj.error);
    if (obj.error && typeof obj.error === "object") return extractErrorText(obj.error);
    // { message: "..." }
    if (typeof obj.message === "string") return obj.message;
  }
  return String(input);
}

/**
 * Парсит ошибку из ответа API в типизированную структуру.
 */
export function parseApiError(input: unknown, fallbackTitle?: string): ParsedError {
  const text = extractErrorText(input);
  const lower = text.toLowerCase();

  // SKU limit (наш P0001)
  if (lower.includes("sku limit") || lower.includes("p0001")) {
    // Пытаемся вытащить план и числа
    const planMatch = text.match(/(trial|starter|growth|pro)\s+allows? up to (\d+)\s+SKUs?/i);
    const currentMatch = text.match(/current:\s*(\d+)/i);
    const plan = planMatch?.[1] ?? t("error.skuLimit.currentPlan");
    const limit = planMatch?.[2] ?? "?";
    const current = currentMatch?.[1] ?? "?";
    return {
      kind: "sku_limit",
      title: t("error.skuLimit.title"),
      message: t("error.skuLimit.message", { plan, limit, current }),
      action: { label: t("error.action.toBilling"), href: "/billing" },
      raw: text,
    };
  }

  // Auth ошибки маркетплейса
  if (lower.includes("401") || lower.includes("403") || lower.includes("unauthorized") || lower.includes("forbidden")) {
    if (lower.includes("ozon") || lower.includes("client-id") || lower.includes("api-key")) {
      return {
        kind: "auth_failed",
        title: t("error.ozonAuth.title"),
        message: t("error.ozonAuth.message"),
        raw: text,
      };
    }
    if (lower.includes("wildberries") || lower.includes("wb")) {
      return {
        kind: "auth_failed",
        title: t("error.wbAuth.title"),
        message: t("error.wbAuth.message"),
        raw: text,
      };
    }
    return {
      kind: "permission",
      title: t("error.permission.title"),
      message: t("error.permission.message"),
      raw: text,
    };
  }

  // 5xx маркетплейса
  if (lower.includes("502") || lower.includes("503") || lower.includes("504")
      || lower.includes("bad gateway") || lower.includes("service unavailable")) {
    return {
      kind: "marketplace_down",
      title: t("error.marketplaceDown.title"),
      message: t("error.marketplaceDown.message"),
      raw: text,
    };
  }

  // Rate limit
  if (lower.includes("rate limit") || lower.includes("429") || lower.includes("too many requests")) {
    return {
      kind: "rate_limit",
      title: t("error.rateLimit.title"),
      message: t("error.rateLimit.message"),
      raw: text,
    };
  }

  // Network / timeout
  if (lower.includes("timeout") || lower.includes("network") || lower.includes("econnrefused") || lower.includes("failed to fetch")) {
    return {
      kind: "network",
      title: t("error.network.title"),
      message: t("error.network.message"),
      raw: text,
    };
  }

  // Validation
  if (lower.includes("обязател") || lower.includes("required") || lower.includes("invalid") || lower.includes("validation")) {
    return {
      kind: "validation",
      title: t("error.validation.title"),
      message: text || t("error.validation.message"),
      raw: text,
    };
  }

  return {
    kind: "unknown",
    title: fallbackTitle ?? t("error.fallback.title"),
    message: text || t("error.unknown.message"),
    raw: text,
  };
}
