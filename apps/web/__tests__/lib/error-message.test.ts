import { describe, it, expect } from "vitest";
import { errMessage } from "@/lib/error-message";

describe("errMessage", () => {
  it("берёт message из Error", () => {
    expect(errMessage(new Error("boom"))).toBe("boom");
  });

  it("берёт message из plain-объекта (PostgrestError не instanceof Error)", () => {
    expect(errMessage({ message: "db down", code: "P0001" })).toBe("db down");
  });

  it("fallback по умолчанию для string/number/null/undefined/object без message", () => {
    expect(errMessage("just a string")).toBe("unknown error");
    expect(errMessage(42)).toBe("unknown error");
    expect(errMessage(null)).toBe("unknown error");
    expect(errMessage(undefined)).toBe("unknown error");
    expect(errMessage({ code: "x" })).toBe("unknown error");
  });

  it("кастомный fallback", () => {
    expect(errMessage(null, "Ошибка")).toBe("Ошибка");
    expect(errMessage({ message: 123 }, "Ошибка")).toBe("Ошибка"); // message не строка
  });
});
