/** @type {import('next').NextConfig} */

// CSP в режиме Report-Only: не блокирует загрузку, но репортит нарушения
// (в консоль браузера). Это безопасный первый шаг — строгий enforcing CSP
// вслепую сломал бы Supabase/Stripe. После проверки реальных нарушений в консоли
// заголовок можно переименовать в "Content-Security-Policy" (enforcing).
//
// Хост Supabase берём из env: инстанс self-hosted (не *.supabase.co), поэтому
// connect-src обязан матчить реальный домен — иначе при enforcing CSP заблокирует
// auth/data/realtime. Гард: при пустом/битом URL падаем на дефолт *.supabase.co.
function supabaseCspHosts() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    if (url) {
      const host = new URL(url).host;
      return { https: `https://${host}`, wss: `wss://${host}` };
    }
  } catch {
    // битый URL — используем дефолт ниже
  }
  return { https: "https://*.supabase.co", wss: "wss://*.supabase.co" };
}
const sbCsp = supabaseCspHosts();
const cspReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://*.sentry.io",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${sbCsp.https} ${sbCsp.wss} https://*.sentry.io https://*.ingest.sentry.io`,
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
  "form-action 'self' https://auth.robokassa.ru",
].join("; ");

const nextConfig = {
  reactStrictMode: true,
  // typedRoutes отключаем — мешает RouteImpl<string> в router.push() с динамическими параметрами
  // experimental: { typedRoutes: true },
  typescript: {
    // TS-проверку прогоняем в CI (tsc), prod-build не блокируем.
    // ВАЖНО: чтобы выключить этот флаг — сначала добиться чистого `tsc` (CI теперь блокирующий).
    ignoreBuildErrors: true,
  },
  eslint: {
    // ESLint тоже только в CI
    ignoreDuringBuilds: true,
  },
  // БАГ 41 fix: security headers против clickjacking/MIME-sniffing/referrer leak.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Разрешаем встраивание ТОЛЬКО со своего origin — нужно для выезжающей
          // карточки SKU (iframe на свой же роут /dashboard/skus/:id). Сторонние
          // сайты зафреймить нас по-прежнему не могут (защита от clickjacking).
          // Раньше тут был DENY и конфликтовал с nginx (тот шлёт SAMEORIGIN):
          // браузер видел два РАЗНЫХ XFO → конфликт → блокировал даже свой
          // iframe (ERR_BLOCKED_BY_RESPONSE). Теперь оба слоя шлют SAMEORIGIN.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Запрещает MIME-sniffing (защита от XSS через misidentified content)
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Не пересылать полный referrer на третьи сайты
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // HSTS — заставить браузер использовать HTTPS на 6 месяцев
          { key: "Strict-Transport-Security", value: "max-age=15552000; includeSubDomains" },
          // Минимальные Permissions-Policy — отключаем камеру/микрофон/геолокацию по умолчанию
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // CSP в Report-Only — собирает нарушения, не ломает прод (см. cspReportOnly выше)
          { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
        ],
      },
    ];
  },
};

export default nextConfig;
