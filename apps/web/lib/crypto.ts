/**
 * AES-256-GCM шифрование секретов на server-side (Next.js API routes).
 * Формат совместим с apps/worker/app/crypto.py:
 *     base64( iv[12] || ciphertext || authTag[16] )
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function masterKey(): Buffer {
  const raw = process.env.SECRET_ENCRYPTION_KEY;
  if (!raw) throw new Error("SECRET_ENCRYPTION_KEY не задан");
  if (raw.length === 64) {
    try {
      return Buffer.from(raw, "hex");
    } catch {}
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`SECRET_ENCRYPTION_KEY должен быть 32 байта, получено ${key.length}`);
  }
  return key;
}

export function encrypt(plaintext: string): string {
  if (!plaintext) return "";
  const key = masterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]).toString("base64");
}

export function decrypt(token: string): string {
  if (!token) return "";
  const key = masterKey();
  const blob = Buffer.from(token, "base64");
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(blob.length - 16);
  const ct = blob.subarray(12, blob.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export function isEncryptionConfigured(): boolean {
  return !!process.env.SECRET_ENCRYPTION_KEY;
}
