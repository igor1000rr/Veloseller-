/** @type {import('next').NextConfig} */

// CSP вынесен в middleware.ts — нужен per-request nonce для strict-dynamic
// (статическим заголовком nonce не сделать). Здесь — остальные security-заголовки.

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
          // CSP (nonce + strict-dynamic) ставит middleware.ts — здесь его НЕ дублируем.
        ],
      },
    ];
  },
};

export default nextConfig;
