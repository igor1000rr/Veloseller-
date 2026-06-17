import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeRedirect } from "@/lib/safe-redirect";

/**
 * Supabase Auth callback.
 *
 * После клика на ссылку подтверждения email (или magic link / password reset)
 * Supabase редиректит сюда с параметром ?code=...
 * Нужно обменять код на сессию (ставит cookies) и редирекнуть куда-то дальше.
 *
 * URL: /auth/callback?code=<auth_code>&next=<optional_path>
 *
 * SECURITY (open redirect): параметр `next` контролируется атакующим через
 * email-фишинг — валидируется через safeRedirect (только относительные пути).
 *
 * Базу для абсолютного редиректа берём из NEXT_PUBLIC_SITE_URL, а НЕ из req.url.
 * За nginx req.url.origin резолвится во внутренний 127.0.0.1:3000 (отсюда был
 * localhost:3000 в Location, issue #2), а Host-заголовок теоретически
 * подделывается. NEXT_PUBLIC_SITE_URL задаётся сервером per-деплой (.ru/.com),
 * не зависит от запроса — одновременно корректный публичный домен и
 * неподделываемая база.
 */
const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || "https://veloseller.ru";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = safeRedirect(url.searchParams.get("next"), "/auth/confirmed");
  const errorParam = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // Супабейс может прислать ошибку (ссылка истекла, уже использовалась, etc.)
  if (errorParam) {
    const target = new URL("/auth/error", SITE_ORIGIN);
    target.searchParams.set("error", errorParam);
    if (errorDescription) target.searchParams.set("description", errorDescription);
    return NextResponse.redirect(target);
  }

  if (!code) {
    // Нет кода — непонятно зачем сюда пришли. Иди на login.
    return NextResponse.redirect(new URL("/login", SITE_ORIGIN));
  }

  // Обмен code → session (ставит sb-...-auth-token cookies)
  const sb = await createSupabaseServerClient();
  const { error } = await sb.auth.exchangeCodeForSession(code);

  if (error) {
    const target = new URL("/auth/error", SITE_ORIGIN);
    target.searchParams.set("error", "exchange_failed");
    target.searchParams.set("description", error.message);
    return NextResponse.redirect(target);
  }

  // Успех — редирект на confirmed-страницу (или валидный относительный путь из ?next=)
  return NextResponse.redirect(new URL(next, SITE_ORIGIN));
}
