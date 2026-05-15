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
