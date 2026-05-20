/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // typedRoutes отключаем — мешает RouteImpl<string> в router.push() с динамическими параметрами
  // experimental: { typedRoutes: true },
  typescript: {
    // TS-проверку прогоняем только в CI (vitest + tsc отдельно), не блокируем prod-build
    ignoreBuildErrors: true,
  },
  eslint: {
    // ESLint тоже только в CI
    ignoreDuringBuilds: true,
  },
  // БАГ 41 fix: security headers против clickjacking/MIME-sniffing/referrer leak.
  // CSP пока не задаём строго (требует whitelist всех external — Stripe.js, Supabase, etc.),
  // но базовые защитные заголовки добавляем.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Запрещаем встраивание сайта в iframe (clickjacking защита)
          { key: "X-Frame-Options", value: "DENY" },
          // Запрещает MIME-sniffing (защита от XSS через misidentified content)
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Не пересылать полный referrer на третьи сайты
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // HSTS — заставить браузер использовать HTTPS на 6 месяцев
          { key: "Strict-Transport-Security", value: "max-age=15552000; includeSubDomains" },
          // Минимальные Permissions-Policy — отключаем камеру/микрофон/геолокацию по умолчанию
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
