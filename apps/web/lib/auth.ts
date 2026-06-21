/**
 * Хелперы аутентификации/авторизации для API-роутов (route handlers).
 *
 * Убирают дублирование паттерна
 *     const { data: { user } } = await supabase.auth.getUser();
 *     if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 * и проверки ADMIN_EMAILS, разбросанной по роутам и server actions.
 *
 * Форма ответа сохранена: { error: "..." } со статусом — её понимает
 * lib/error-parser.ts (kind=permission по слову unauthorized/forbidden).
 *
 * Только для server-side (импортируют NextResponse + серверный Supabase-клиент).
 */
import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Список админских e-mail из ENV (нижний регистр, без пустых). */
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

/** true, если e-mail принадлежит администратору. */
export function isAdminEmail(email: string | null | undefined): boolean {
  return ADMIN_EMAILS.includes((email || "").toLowerCase());
}

/** Аутентифицированный пользователь + готовый серверный клиент. */
export type AuthContext = { supabase: SupabaseClient; user: User };

/**
 * Generic-хелпер ответа об ошибке: подробность пишем в console.error,
 * наружу отдаём только безопасное userMessage. Защищает от утечки
 * внутренних деталей (SQL/имена хостов/stacktrace) в тело ответа.
 *
 * @param status   HTTP-статус ответа.
 * @param userMessage безопасное сообщение для клиента (поле error).
 * @param internal  внутренняя деталь для логов (не уходит клиенту).
 */
export function jsonError(status: number, userMessage: string, internal?: unknown): NextResponse {
  if (internal !== undefined) {
    const detail = internal instanceof Error ? internal.message : internal;
    console.error(`[api ${status}] ${userMessage}:`, detail);
  }
  return NextResponse.json({ error: userMessage }, { status });
}

/**
 * Требует аутентифицированного пользователя.
 * Возвращает { supabase, user } либо NextResponse 401 (вызывающий делает
 * `if (auth instanceof NextResponse) return auth;`).
 */
export async function requireUser(): Promise<AuthContext | NextResponse> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return { supabase, user };
}

/**
 * Требует пользователя-администратора (auth + проверка ADMIN_EMAILS).
 * Возвращает { supabase, user } либо NextResponse (401 если не залогинен,
 * 403 если не админ).
 */
export async function requireAdmin(): Promise<AuthContext | NextResponse> {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  if (!isAdminEmail(auth.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return auth;
}
