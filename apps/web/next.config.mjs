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
};

export default nextConfig;
