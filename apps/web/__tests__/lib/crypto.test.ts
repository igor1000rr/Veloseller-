import { describe, it, expect, beforeEach } from "vitest";
import { Buffer } from "node:buffer";

describe("lib/crypto", () => {
  beforeEach(() => {
    delete process.env.SECRET_ENCRYPTION_KEY;
  });

  it("encrypt/decrypt round-trip с base64 ключом", async () => {
    process.env.SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 0xAB).toString("base64");
    const { encrypt, decrypt } = await import("@/lib/crypto");
    const original = "ozon-api-key-secret-12345";
    const enc = encrypt(original);
    expect(enc).not.toBe(original);
    expect(decrypt(enc)).toBe(original);
  });

  it("encrypt/decrypt с hex ключом (64 chars)", async () => {
    process.env.SECRET_ENCRYPTION_KEY = "a".repeat(64);
    const { encrypt, decrypt } = await import("@/lib/crypto");
    const enc = encrypt("hello");
    expect(decrypt(enc)).toBe("hello");
  });

  it("64 символа, но НЕ валидный hex — throws (Buffer.from молча обрезает)", async () => {
    // 'z' не hex → Buffer.from(..,"hex") вернёт буфер < 32 байт.
    process.env.SECRET_ENCRYPTION_KEY = "z".repeat(64);
    const { encrypt } = await import("@/lib/crypto");
    expect(() => encrypt("x")).toThrow(/hex/);
  });

  it("64 символа, частично валидный hex — throws (длина != 32)", async () => {
    // 62 валидных hex-символа + 2 невалидных: Buffer оборвётся раньше 32 байт.
    process.env.SECRET_ENCRYPTION_KEY = "a".repeat(62) + "zz";
    const { encrypt } = await import("@/lib/crypto");
    expect(() => encrypt("x")).toThrow();
  });

  it("encrypt('') → ''", async () => {
    process.env.SECRET_ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");
    const { encrypt } = await import("@/lib/crypto");
    expect(encrypt("")).toBe("");
  });

  it("decrypt('') → ''", async () => {
    process.env.SECRET_ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");
    const { decrypt } = await import("@/lib/crypto");
    expect(decrypt("")).toBe("");
  });

  it("разные encrypt() выдают разные шифротексты (рандомный IV)", async () => {
    process.env.SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
    const { encrypt } = await import("@/lib/crypto");
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });

  it("без env — throws", async () => {
    const { encrypt } = await import("@/lib/crypto");
    expect(() => encrypt("x")).toThrow(/SECRET_ENCRYPTION_KEY/);
  });

  it("ключ не 32 байта — throws", async () => {
    process.env.SECRET_ENCRYPTION_KEY = Buffer.alloc(16).toString("base64");
    const { encrypt } = await import("@/lib/crypto");
    expect(() => encrypt("x")).toThrow();
  });

  it("decrypt с неверным ключом — throws", async () => {
    process.env.SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
    const { encrypt } = await import("@/lib/crypto");
    const enc = encrypt("secret");
    process.env.SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 2).toString("base64");
    // @ts-expect-error vite cache-bust query (?v=2) форсит свежий модуль; tsc его не резолвит
    const fresh = await import("@/lib/crypto?v=2");
    expect(() => fresh.decrypt(enc)).toThrow();
  });

  it("isEncryptionConfigured()", async () => {
    const { isEncryptionConfigured } = await import("@/lib/crypto");
    expect(isEncryptionConfigured()).toBe(false);
    process.env.SECRET_ENCRYPTION_KEY = "anything";
    expect(isEncryptionConfigured()).toBe(true);
  });
});
