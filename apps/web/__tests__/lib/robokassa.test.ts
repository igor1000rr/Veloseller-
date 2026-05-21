"""Robokassa lib unit-тесты: подпись MD5, валидация, генерация URL."""
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Мочим env перед каждым тестом
const ORIG_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIG_ENV };
});

describe("Robokassa: checkRobokassaConfig", () => {
  it("возвращает ошибку если ENV пустые", async () => {
    delete process.env.ROBOKASSA_MERCHANT_LOGIN;
    delete process.env.ROBOKASSA_PASSWORD_1;
    delete process.env.ROBOKASSA_PASSWORD_2;
    delete process.env.ROBOKASSA_TEST_MODE;
    const { checkRobokassaConfig } = await import("@/lib/robokassa");
    const r = checkRobokassaConfig();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/MERCHANT_LOGIN/);
  });

  it("ок если все боевые ключи заданы", async () => {
    process.env.ROBOKASSA_MERCHANT_LOGIN = "veloseller";
    process.env.ROBOKASSA_PASSWORD_1 = "pw1";
    process.env.ROBOKASSA_PASSWORD_2 = "pw2";
    delete process.env.ROBOKASSA_TEST_MODE;
    const { checkRobokassaConfig } = await import("@/lib/robokassa");
    expect(checkRobokassaConfig().ok).toBe(true);
  });

  it("в test mode требует TEST_PASSWORD_1/2", async () => {
    process.env.ROBOKASSA_MERCHANT_LOGIN = "veloseller";
    process.env.ROBOKASSA_TEST_MODE = "1";
    delete process.env.ROBOKASSA_TEST_PASSWORD_1;
    const { checkRobokassaConfig } = await import("@/lib/robokassa");
    const r = checkRobokassaConfig();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/TEST_PASSWORD_1/);
  });
});

describe("Robokassa: isValidPlan", () => {
  it("принимает starter/growth/pro", async () => {
    const { isValidPlan } = await import("@/lib/robokassa");
    expect(isValidPlan("starter")).toBe(true);
    expect(isValidPlan("growth")).toBe(true);
    expect(isValidPlan("pro")).toBe(true);
  });
  it("отклоняет всё другое", async () => {
    const { isValidPlan } = await import("@/lib/robokassa");
    expect(isValidPlan("trial")).toBe(false);
    expect(isValidPlan("enterprise")).toBe(false);
    expect(isValidPlan("")).toBe(false);
    expect(isValidPlan("STARTER")).toBe(false);
  });
});

describe("Robokassa: PLAN_PRICES", () => {
  it("цены 2500 / 6900 / 14900", async () => {
    const { PLAN_PRICES } = await import("@/lib/robokassa");
    expect(PLAN_PRICES.starter).toBe(2500);
    expect(PLAN_PRICES.growth).toBe(6900);
    expect(PLAN_PRICES.pro).toBe(14900);
  });
});

describe("Robokassa: buildPaymentUrl", () => {
  beforeEach(() => {
    process.env.ROBOKASSA_MERCHANT_LOGIN = "veloseller_test";
    process.env.ROBOKASSA_PASSWORD_1 = "secret1";
    process.env.ROBOKASSA_PASSWORD_2 = "secret2";
    delete process.env.ROBOKASSA_TEST_MODE;
  });

  it("формирует URL с правильными параметрами", async () => {
    const { buildPaymentUrl } = await import("@/lib/robokassa");
    const url = buildPaymentUrl({
      invId: 42,
      amount: 2500,
      description: "Veloseller — Старт",
    });
    expect(url).toMatch(/^https:\/\/auth\.robokassa\.ru\/Merchant\/Index\.aspx\?/);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("MerchantLogin")).toBe("veloseller_test");
    expect(params.get("OutSum")).toBe("2500.00");
    expect(params.get("InvId")).toBe("42");
    expect(params.get("Culture")).toBe("ru");
    expect(params.get("SignatureValue")).toMatch(/^[a-f0-9]{32}$/);
  });

  it("подпись — MD5 от 'login:outSum:invId:password1'", async () => {
    const { buildPaymentUrl } = await import("@/lib/robokassa");
    const { createHash } = await import("node:crypto");
    const url = buildPaymentUrl({ invId: 1, amount: 100, description: "Тест" });
    const params = new URLSearchParams(url.split("?")[1]);
    const expected = createHash("md5").update("veloseller_test:100.00:1:secret1", "utf8").digest("hex");
    expect(params.get("SignatureValue")).toBe(expected);
  });

  it("в test mode добавляет IsTest=1 и использует TEST_PASSWORD_1", async () => {
    process.env.ROBOKASSA_TEST_MODE = "1";
    process.env.ROBOKASSA_TEST_PASSWORD_1 = "test_secret1";
    process.env.ROBOKASSA_TEST_PASSWORD_2 = "test_secret2";
    const { buildPaymentUrl } = await import("@/lib/robokassa");
    const { createHash } = await import("node:crypto");
    const url = buildPaymentUrl({ invId: 1, amount: 100, description: "Тест" });
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("IsTest")).toBe("1");
    const expected = createHash("md5").update("veloseller_test:100.00:1:test_secret1", "utf8").digest("hex");
    expect(params.get("SignatureValue")).toBe(expected);
  });

  it("email включается в URL", async () => {
    const { buildPaymentUrl } = await import("@/lib/robokassa");
    const url = buildPaymentUrl({ invId: 1, amount: 100, description: "Тест", email: "u@x.ru" });
    expect(url).toContain("Email=u%40x.ru");
  });
});

describe("Robokassa: verifyResultSignature", () => {
  beforeEach(() => {
    process.env.ROBOKASSA_MERCHANT_LOGIN = "veloseller_test";
    process.env.ROBOKASSA_PASSWORD_1 = "secret1";
    process.env.ROBOKASSA_PASSWORD_2 = "secret2";
    delete process.env.ROBOKASSA_TEST_MODE;
  });

  it("принимает правильную подпись", async () => {
    const { verifyResultSignature } = await import("@/lib/robokassa");
    const { createHash } = await import("node:crypto");
    // Робокасса формирует подпись из outSum:invId:password2
    const sig = createHash("md5").update("2500.00:42:secret2", "utf8").digest("hex");
    expect(verifyResultSignature({
      outSum: "2500.00", invId: "42", signatureValue: sig,
    })).toBe(true);
  });

  it("отклоняет неправильную подпись", async () => {
    const { verifyResultSignature } = await import("@/lib/robokassa");
    expect(verifyResultSignature({
      outSum: "2500.00", invId: "42", signatureValue: "deadbeef".repeat(4),
    })).toBe(false);
  });

  it("case-insensitive (Робокасса может прислать в UPPERCASE)", async () => {
    const { verifyResultSignature } = await import("@/lib/robokassa");
    const { createHash } = await import("node:crypto");
    const sig = createHash("md5").update("2500.00:42:secret2", "utf8").digest("hex");
    expect(verifyResultSignature({
      outSum: "2500.00", invId: "42", signatureValue: sig.toUpperCase(),
    })).toBe(true);
  });

  it("без PASSWORD_2 в env возвращает false", async () => {
    delete process.env.ROBOKASSA_PASSWORD_2;
    const { verifyResultSignature } = await import("@/lib/robokassa");
    expect(verifyResultSignature({
      outSum: "2500.00", invId: "42", signatureValue: "any_signature",
    })).toBe(false);
  });

  it("в test mode использует TEST_PASSWORD_2", async () => {
    process.env.ROBOKASSA_TEST_MODE = "1";
    process.env.ROBOKASSA_TEST_PASSWORD_2 = "test_secret2";
    const { verifyResultSignature } = await import("@/lib/robokassa");
    const { createHash } = await import("node:crypto");
    const sig = createHash("md5").update("100.00:1:test_secret2", "utf8").digest("hex");
    expect(verifyResultSignature({
      outSum: "100.00", invId: "1", signatureValue: sig,
    })).toBe(true);
  });
});
