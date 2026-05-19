/**
 * Парсер ошибок API → человеческое сообщение для UI.
 *
 * Разбирает разные форматы ошибок (наши + Supabase + Ozon + WB) и приводит
 * к единому типу ParsedError с заголовком, текстом и действием.
 */

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
export function parseApiError(input: unknown, fallbackTitle = "Что-то пошло не так"): ParsedError {
  const text = extractErrorText(input);
  const lower = text.toLowerCase();

  // SKU limit (наш P0001)
  if (lower.includes("sku limit") || lower.includes("p0001")) {
    // Пытаемся вытащить план и числа
    const planMatch = text.match(/(trial|starter|growth|pro)\s+allows? up to (\d+)\s+SKUs?/i);
    const currentMatch = text.match(/current:\s*(\d+)/i);
    const plan = planMatch?.[1] ?? "текущий план";
    const limit = planMatch?.[2] ?? "?";
    const current = currentMatch?.[1] ?? "?";
    return {
      kind: "sku_limit",
      title: "Лимит SKU превышен",
      message: `Тариф «${plan}» позволяет до ${limit} SKU. Сейчас у вас ${current}. Перейдите на тариф выше — мы автоматически досинхронизируем остальные товары.`,
      action: { label: "Перейти к тарифам", href: "/billing" },
      raw: text,
    };
  }

  // Auth ошибки маркетплейса
  if (lower.includes("401") || lower.includes("403") || lower.includes("unauthorized") || lower.includes("forbidden")) {
    if (lower.includes("ozon") || lower.includes("client-id") || lower.includes("api-key")) {
      return {
        kind: "auth_failed",
        title: "Ozon не принял ключи",
        message: "Проверьте Client-Id и API-Key. Они должны быть из активного личного кабинета Ozon Seller → Настройки → API. Ключ должен иметь хотя бы read-only доступ.",
        raw: text,
      };
    }
    if (lower.includes("wildberries") || lower.includes("wb")) {
      return {
        kind: "auth_failed",
        title: "Wildberries не принял токен",
        message: "Токен невалидный или истёк. Получите новый статистический токен в кабинете WB → Профиль → Доступ к API → Статистика.",
        raw: text,
      };
    }
    return {
      kind: "permission",
      title: "Нет доступа",
      message: "У вас нет прав на это действие. Войдите заново или обратитесь в поддержку.",
      raw: text,
    };
  }

  // 5xx маркетплейса
  if (lower.includes("502") || lower.includes("503") || lower.includes("504")
      || lower.includes("bad gateway") || lower.includes("service unavailable")) {
    return {
      kind: "marketplace_down",
      title: "Маркетплейс временно недоступен",
      message: "Сервис маркетплейса сейчас не отвечает. Это не на нашей стороне. Попробуйте синхронизировать через 5-10 минут.",
      raw: text,
    };
  }

  // Rate limit
  if (lower.includes("rate limit") || lower.includes("429") || lower.includes("too many requests")) {
    return {
      kind: "rate_limit",
      title: "Превышен лимит запросов",
      message: "Слишком много запросов за короткое время. Подождите минуту и попробуйте снова.",
      raw: text,
    };
  }

  // Network / timeout
  if (lower.includes("timeout") || lower.includes("network") || lower.includes("econnrefused") || lower.includes("failed to fetch")) {
    return {
      kind: "network",
      title: "Не удалось связаться с сервером",
      message: "Проверьте интернет-соединение. Если связь стабильная — возможно, наш worker временно недоступен. Попробуйте через минуту.",
      raw: text,
    };
  }

  // Validation
  if (lower.includes("обязател") || lower.includes("required") || lower.includes("invalid") || lower.includes("validation")) {
    return {
      kind: "validation",
      title: "Проверьте поля",
      message: text || "Одно из полей заполнено неверно или не заполнено.",
      raw: text,
    };
  }

  return {
    kind: "unknown",
    title: fallbackTitle,
    message: text || "Произошла непредвиденная ошибка. Если повторяется — напишите в поддержку.",
    raw: text,
  };
}
