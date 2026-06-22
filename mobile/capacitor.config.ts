import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor-обёртка Veloseller.
 *
 * Veloseller — SSR Next.js (серверный рендер, API-роуты, auth по кукам, middleware/CSP),
 * его НЕЛЬЗЯ застатичить и упаковать. Поэтому приложение — нативная оболочка, у которой
 * WebView грузит боевой сайт (`server.url`), + нативные плагины сверху (пуши, сплэш).
 * Сессия живёт в куках WebView — логин работает как в браузере.
 *
 * iOS-нюанс: Apple требует IAP для продажи подписок в приложении (конфликт с Robokassa).
 * Поэтому в iOS-сборке апгрейд/оплату прячем (см. lib/platform на стороне веба),
 * пользователь подписывается на сайте; приложение — просмотр данных + пуш-алерты.
 */
const config: CapacitorConfig = {
  appId: "ru.veloseller.app",
  appName: "Veloseller",
  // Заглушка-webDir (Capacitor требует папку с index.html). Реальный контент — с server.url.
  webDir: "www",
  server: {
    url: "https://veloseller.ru",
    // куда WebView разрешено уходить внутри приложения (иначе откроется во внешнем браузере).
    // Robokassa — для Android; на iOS оплату прячем, но домен оставляем на случай Success/Fail.
    allowNavigation: [
      "veloseller.ru",
      "*.veloseller.ru",
      "auth.robokassa.ru",
      "*.robokassa.ru",
    ],
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#f7f4e9",
      showSpinner: false,
    },
  },
};

export default config;
