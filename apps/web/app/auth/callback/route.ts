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
 * БАГ 47 расширен: ?next= защищён через safeRedirect — раньше принимал
 * https://evil.com и редиректил юзера на чужой сайт после успешного входа.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = safeRedirect(url.searchParams.get("next"), "/auth/confirmed");
  const errorParam = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // Супабейс может прислать ошибку (ссылка истекла, уже использовалась, etc.)
  if (errorParam) {
    const target = new URL("/auth/error", url.origin);
    target.searchParams.set("error", errorParam);
    if (errorDescription) target.searchParams.set("description", errorDescription);
    return NextResponse.redirect(target);
  }

  if (!code) {
    // Нет кода — непонятно зачем сюда пришли. Иди на login.
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  // Обмен code → session (ставит sb-...-auth-token cookies)
  const sb = await createSupabaseServerClient();
  const { error } = await sb.auth.exchangeCodeForSession(code);

  if (error) {
    const target = new URL("/auth/error", url.origin);
    target.searchParams.set("error", "exchange_failed");
    target.searchParams.set("description", error.message);
    return NextResponse.redirect(target);
  }

  // Успех — редирект на confirmed-страницу (или куда просил юзер в ?next=)
  return NextResponse.redirect(new URL(next, url.origin));
}
