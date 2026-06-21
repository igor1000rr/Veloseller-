import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Хост self-hosted Supabase для connect-src (зеркалит next.config). При битом
// URL — дефолт *.supabase.co.
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

// Строгий CSP с per-request nonce. strict-dynamic: современные браузеры доверяют
// только nonce'ированному загрузчику и тому, что он подгрузит (Next-чанки,
// Яндекс.Метрика), игнорируя host-allowlist и 'unsafe-inline'; старые браузеры —
// fallback на 'unsafe-inline'/https:. style-src оставляем 'unsafe-inline'
// (Tailwind/Next inline-стили; XSS-риск стилей низкий).
function buildCsp(nonce: string): string {
  const sb = supabaseCspHosts();
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${sb.https} ${sb.wss} https://*.sentry.io https://*.ingest.sentry.io https://mc.yandex.ru https://mc.yandex.com`,
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    "form-action 'self' https://auth.robokassa.ru",
  ].join("; ");
}

export async function middleware(request: NextRequest) {
  // Per-request nonce для строгого CSP. Кладём enforcing-CSP в ЗАПРОС-заголовки —
  // так Next проставляет nonce своим инлайн-скриптам и <Script> (Метрика). В ОТВЕТ
  // пока шлём Report-Only: ничего не блокируется, но нарушения видны в консоли.
  // ФЛИП НА ENFORCE: поменять имя response-заголовка на "Content-Security-Policy"
  // (см. ниже) — после проверки, что в консоли нет нарушений от своих скриптов.
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  // Применяет CSP/no-cache/Vary к любому ответу, который мы отдаём.
  const cspResponseHeader = "content-security-policy-report-only"; // флип → "content-security-policy"

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
  const path = request.nextUrl.pathname;

  // Защита приватных разделов
  const isPrivate = path.startsWith("/dashboard")
    || path.startsWith("/connections")
    || path.startsWith("/onboarding")
    || path.startsWith("/admin")
    || path.startsWith("/billing")
    || path.startsWith("/account");

  if (isPrivate && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", path);
    const redirect = NextResponse.redirect(url);
    redirect.headers.set(cspResponseHeader, csp);
    return redirect;
  }

  // Залогиненного на /login/register сразу в dashboard
  if (user && (path === "/login" || path === "/register")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    const redirect = NextResponse.redirect(url);
    redirect.headers.set(cspResponseHeader, csp);
    return redirect;
  }

  // No-cache headers для приватных разделов и API.
  if (isPrivate || path.startsWith("/api/")) {
    response.headers.set("Cache-Control", "private, no-store, no-cache, must-revalidate, max-age=0");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    response.headers.set("Vary", "Cookie, Accept-Encoding");
  }

  response.headers.set(cspResponseHeader, csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
