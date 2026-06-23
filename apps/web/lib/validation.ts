import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Единый слой валидации тела API-запросов через zod (вместо ручных проверок в
 * каждом роуте). Возвращает либо распарсенные типизированные данные, либо готовый
 * ответ 400 с человекочитаемой ошибкой (первое нарушение схемы).
 *
 * Пустое/битое тело трактуется как {} — роуты со всеми опциональными полями это
 * допускают (например bulk-ack без kind), а роуты с обязательными полями получат
 * понятную 400 от самой схемы.
 */
export async function parseJsonBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path.join(".");
    const msg = first
      ? (path ? `${path}: ${first.message}` : first.message)
      : "Некорректные данные";
    return { ok: false, response: NextResponse.json({ error: msg }, { status: 400 }) };
  }
  return { ok: true, data: parsed.data };
}
