/**
 * Подпись токена привязки Telegram для deep-link.
 *
 * Закрывает hijack: раньше deep-link содержал сырой seller UUID, и любой,
 * кто его знал, мог привязать свой чат к чужому селлеру через /start <uuid>.
 * Теперь ссылка содержит подписанный токен с TTL — подделать без секрета нельзя.
 *
 * Формат (только hex + '_', влезает в 64-символьный лимит start-параметра Telegram):
 *   <uuidHex32>_<expHex>_<sigHex16>
 *
 * Алгоритм ОБЯЗАН совпадать с apps/worker/app/telegram_link.py:
 *   msg = `${uuidHex}_${expHex}`  (uuid без дефисов, lowercase; exp — unix-сек в hex)
 *   sig = HMAC_SHA256(msg, TELEGRAM_LINK_SECRET).hex().slice(0, 16)
 *   token = `${msg}_${sig}`
 * Никакой бинарной упаковки — только строки, чтобы TS и Python совпадали байт-в-байт.
 *
 * Серверный модуль (node:crypto) — вызывать только в Server Components / route handlers.
 */
import { createHmac } from "node:crypto";

const TTL_SECONDS = 30 * 60; // токен живёт 30 минут
const SIG_LEN = 16;

/**
 * Возвращает подписанный токен для ?start=, либо null если секрет не задан
 * или sellerId не похож на UUID. null → веб покажет ручной ввод Chat ID
 * (deep-link просто не отрисуется), прод не ломается.
 */
export function signTelegramLinkToken(sellerId: string): string | null {
  const secret = process.env.TELEGRAM_LINK_SECRET;
  if (!secret) return null;

  const uuidHex = sellerId.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(uuidHex)) return null;

  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const expHex = exp.toString(16);
  const msg = `${uuidHex}_${expHex}`;
  const sig = createHmac("sha256", secret).update(msg, "utf8").digest("hex").slice(0, SIG_LEN);

  return `${msg}_${sig}`;
}
