/**
 * Тесты для error-parser: разные форматы ошибок → структурированный ParsedError.
 */
import { describe, it, expect } from "vitest";
import { parseApiError } from "../../lib/error-parser";

describe("parseApiError", () => {
  describe("SKU limit (P0001)", () => {
    it("распознаёт SKU limit reached из FastAPI detail", () => {
      const input = {
        detail: "Ozon sync error: {'message': 'SKU limit reached: trial allows up to 50 SKUs (current: 50).', 'code': 'P0001'}",
      };
      const result = parseApiError(input);
      expect(result.kind).toBe("sku_limit");
      expect(result.title).toBe("Лимит SKU превышен");
      expect(result.message).toContain("trial");
      expect(result.message).toContain("50");
      expect(result.action?.href).toBe("/billing");
    });

    it("распознаёт SKU limit с разных тарифов", () => {
      const result = parseApiError({ error: "SKU limit reached: starter allows up to 500 SKUs (current: 500)." });
      expect(result.kind).toBe("sku_limit");
      expect(result.message).toContain("starter");
      expect(result.message).toContain("500");
    });

    it("распознаёт только по коду P0001 без подробностей", () => {
      const result = parseApiError({ detail: "Database error: P0001" });
      expect(result.kind).toBe("sku_limit");
    });
  });

  describe("Auth failures", () => {
    it("Ozon 401 → auth_failed для Ozon", () => {
      const result = parseApiError({ error: "Ozon API returned 401 Unauthorized: invalid client-id" });
      expect(result.kind).toBe("auth_failed");
      expect(result.title).toContain("Ozon");
      expect(result.message).toContain("Client-Id");
    });

    it("WB 403 → auth_failed для WB", () => {
      const result = parseApiError({ detail: "Wildberries returned 403 Forbidden" });
      expect(result.kind).toBe("auth_failed");
      expect(result.title).toContain("Wildberries");
    });

    it("Обычный 401 без маркетплейса → permission", () => {
      const result = parseApiError({ error: "Unauthorized" });
      expect(result.kind).toBe("permission");
    });
  });

  describe("Marketplace 5xx", () => {
    it("503 Service Unavailable → marketplace_down", () => {
      const result = parseApiError({ error: "503 Service Unavailable from upstream" });
      expect(result.kind).toBe("marketplace_down");
      expect(result.message).toContain("маркетплейса");
    });

    it("Bad Gateway → marketplace_down", () => {
      const result = parseApiError({ detail: "502 Bad Gateway" });
      expect(result.kind).toBe("marketplace_down");
    });
  });

  describe("Rate limit", () => {
    it("429 → rate_limit", () => {
      const result = parseApiError({ error: "429 Too Many Requests" });
      expect(result.kind).toBe("rate_limit");
    });

    it("Rate limit exceeded → rate_limit", () => {
      const result = parseApiError({ error: "Rate limit exceeded" });
      expect(result.kind).toBe("rate_limit");
    });
  });

  describe("Network errors", () => {
    it("timeout → network", () => {
      const result = parseApiError("Request timeout after 60s");
      expect(result.kind).toBe("network");
    });

    it("failed to fetch → network", () => {
      const result = parseApiError("Failed to fetch");
      expect(result.kind).toBe("network");
    });

    it("ECONNREFUSED → network", () => {
      const result = parseApiError({ error: "ECONNREFUSED 127.0.0.1:8001" });
      expect(result.kind).toBe("network");
    });
  });

  describe("Validation", () => {
    it("required field → validation", () => {
      const result = parseApiError({ error: "config.client_id обязателен" });
      expect(result.kind).toBe("validation");
    });

    it("invalid JSON → validation", () => {
      const result = parseApiError({ detail: "Invalid JSON body" });
      expect(result.kind).toBe("validation");
    });
  });

  describe("Fallback", () => {
    it("Unknown error → unknown", () => {
      const result = parseApiError({ error: "Something weird" });
      expect(result.kind).toBe("unknown");
      expect(result.title).toBe("Что-то пошло не так");
    });

    it("Custom fallback title", () => {
      const result = parseApiError(null, "Не удалось создать подключение");
      expect(result.title).toBe("Не удалось создать подключение");
    });

    it("Сохраняет raw для debug", () => {
      const result = parseApiError({ error: "weird specific error" });
      expect(result.raw).toBe("weird specific error");
    });
  });

  describe("Input format variations", () => {
    it("Строка JSON в detail парсится", () => {
      const result = parseApiError({
        detail: '{"message":"SKU limit reached: trial allows up to 50 SKUs (current: 50).","code":"P0001"}',
      });
      expect(result.kind).toBe("sku_limit");
    });

    it("Простая строка ошибки", () => {
      const result = parseApiError("Network timeout");
      expect(result.kind).toBe("network");
    });

    it("Глубокая вложенность", () => {
      const result = parseApiError({
        error: { detail: { message: "Rate limit exceeded" } },
      });
      expect(result.kind).toBe("rate_limit");
    });

    it("null / undefined / пустота → unknown с fallback", () => {
      expect(parseApiError(null).kind).toBe("unknown");
      expect(parseApiError(undefined).kind).toBe("unknown");
      expect(parseApiError("").kind).toBe("unknown");
      expect(parseApiError({}).kind).toBe("unknown");
    });
  });
});
