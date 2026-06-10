/**
 * Подпись токена привязки Telegram для deep-link.
 *
 * Закрывает hijack: ссылка содержит подписанный токен с TTL (а не сырой UUID).
 *
 * Формат (hex + '_' + опц. метка инстанса, влезает в 64-символьный лимит):
 *   [<instance>_]<uuidHex32>_<expHex>_<sigHex16>
 *
 * instance — 'r' (veloseller.ru) | 'c' (.com), берётся из TELEGRAM_INSTANCE
 * (по умолчанию 'c'). Единый бот на EU по метке решает, в чью базу писать chat_id.
 *
 * Алгоритм ОБЯЗАН совпадать с apps/worker/app/telegram_link.py:
 *   msg = `${instance}_${uuidHex}_${expHex}`  (uuid без дефисов, lowercase; exp — unix-сек в hex)
 *   sig = HMAC_SHA256(msg, TELEGRAM_LINK_SECRET).hex().slice(0, 16)
 *   token = `${msg}_${sig}`
 * Только строки — чтобы TS и Python совпадали байт-в-байт.
 *
 * Серверный модуль (node:crypto) — вызывать только в Server Components / route handlers.
 */
import { createHmac } from "node:crypto";

const TTL_SECONDS = 30 * 60; // токен живёт 30 минут
const SIG_LEN = 16;

/**
 * Возвращает подписанный токен для ?start=, либо null если секрет не задан
 * или sellerId не похож на UUID. null → веб покажет ручной ввод Chat ID.
 */
export function signTelegramLinkToken(sellerId: string): string | null {
  const secret = process.env.TELEGRAM_LINK_SECRET;
  if (!secret) return null;

  const uuidHex = sellerId.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(uuidHex)) return null;

  const instance = process.env.TELEGRAM_INSTANCE === "r" ? "r" : "c";
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const expHex = exp.toString(16);
  const msg = `${instance}_${uuidHex}_${expHex}`;
  const sig = createHmac("sha256", secret).update(msg, "utf8").digest("hex").slice(0, SIG_LEN);

  return `${msg}_${sig}`;
}
