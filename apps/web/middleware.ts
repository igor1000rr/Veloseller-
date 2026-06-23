import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Хост self-hosted Supabase для connect-src. При битом URL — дефолт *.supabase.co.
function supabaseCspHosts() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    if (url) {
      const host = new URL(url).host;
      return { https: `https://${host}`, wss: `wss://${host}` };
    }
  } catch {
    /* битый URL — дефолт ниже */
  }
  return { https: "https://*.supabase.co", wss: "wss://*.supabase.co" };
}

// Общие директивы (одинаковы для строгого и мягкого CSP).
function commonCsp(sb: { https: string; wss: string }): string[] {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${sb.https} ${sb.wss} https://*.sentry.io https://*.ingest.sentry.io https://mc.yandex.ru https://mc.yandex.com wss://mc.yandex.ru wss://mc.yandex.com`,
    "frame-src 'self'",
    "form-action 'self' https://auth.robokassa.ru",
  ];
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Приватные (динамические) app-разделы — там данные юзера и Next рендерит
  // per-request, поэтому работает СТРОГИЙ nonce-CSP (script-src strict-dynamic).
  const isPrivate = path.startsWith("/dashboard")
    || path.startsWith("/connections")
    || path.startsWith("/onboarding")
    || path.startsWith("/admin")
    || path.startsWith("/billing")
    || path.startsWith("/account");

  // CSP раздельный:
  //  - приватные app-роуты → строгий nonce + strict-dynamic (enforce). nonce
  //    кладём в request → Next проставляет его своим скриптам.
  //  - публичные/статика (лендинг, блог, auth — prerender/SSG) → БЕЗ nonce, иначе
  //    per-request nonce не совпал бы с вшитым при сборке и заблокировал бы скрипты
  //    статических страниц. Мягкий enforce с 'unsafe-inline' (страницы публичные,
  //    без данных юзера). object-src/base-uri/frame-ancestors/connect/form-action
  //    защищают и здесь.
  const sb = supabaseCspHosts();
  const common = commonCsp(sb);
  let nonce: string | null = null;
  let csp: string;
  if (isPrivate) {
    nonce = btoa(crypto.randomUUID());
    // СТРОГО: только nonce + strict-dynamic. Раньше тут были ещё `https:` и
    // `'unsafe-inline'` как фолбэк — но на strict-dynamic-браузерах они и так
    // игнорируются, а на старых (CSP2, без strict-dynamic) именно они схлопывали
    // политику до «любой inline + любой https-скрипт». Их удаление не ломает
    // современные браузеры (strict-dynamic + nonce работает), а легаси делает
    // строго безопаснее. Свои скрипты Next нонсит через x-nonce (см. ниже).
    csp = [
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
      ...common,
    ].join("; ");
  } else {
    csp = [
      "script-src 'self' 'unsafe-inline' https://*.sentry.io https://mc.yandex.ru",
      ...common,
    ].join("; ");
  }

  const requestHeaders = new Headers(request.headers);
  if (nonce) {
    // Только для app-роутов: nonce в request → Next нонсит свои скрипты, страница
    // становится динамической (это ок, там и так per-request). Публичным НЕ ставим —
    // чтобы они остались prerender/SSG и не ломались.
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("content-security-policy", csp);
  }

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (isPrivate && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", path);
    const redirect = NextResponse.redirect(url);
    redirect.headers.set("content-security-policy", csp);
    return redirect;
  }

  if (user && (path === "/login" || path === "/register")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    const redirect = NextResponse.redirect(url);
    redirect.headers.set("content-security-policy", csp);
    return redirect;
  }

  // No-cache headers для приватных разделов и API.
  if (isPrivate || path.startsWith("/api/")) {
    response.headers.set("Cache-Control", "private, no-store, no-cache, must-revalidate, max-age=0");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    response.headers.set("Vary", "Cookie, Accept-Encoding");
  }

  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
