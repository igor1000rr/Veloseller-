import type { Metadata, Viewport } from "next";
import { Geologica, Onest, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { CookieBanner } from "./_components/CookieBanner";
import { LOCALE } from "@/lib/features";

// .com задаёт NEXT_PUBLIC_SITE_URL=https://<домен>; дефолт — РФ-прод.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://veloseller.ru";
const isEn = LOCALE === "en";

const display = Geologica({
  subsets: ["latin", "cyrillic"],
  variable: "--font-display",
  display: "swap",
});
const body = Onest({
  subsets: ["latin", "cyrillic"],
  variable: "--font-body",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin", "cyrillic"],
  variable: "--font-mono",
  display: "swap",
});

const TITLE_DEFAULT = isEn
  ? "Veloseller — inventory management for Shopify sellers"
  : "Veloseller — управление остатками на Wildberries и Ozon";
const DESCRIPTION = isEn
  ? "TVelo accounts for out-of-stock days. True sales velocity, stockout forecast, safety stock, days of cover. For Shopify and Google Sheets sellers."
  : "TVelo учитывает out-of-stock дни. Реальная скорость продаж, прогноз нехватки, расчёт минимального остатка, дни покрытия. Для селлеров Wildberries, Ozon FBO/FBS и Google Sheets.";
const OG_DESCRIPTION = isEn
  ? "TVelo accounts for out-of-stock days. True sales velocity, stockout forecast, safety stock, days of cover."
  : "TVelo учитывает out-of-stock дни. Реальная скорость продаж, прогноз нехватки, минимальный остаток, дни покрытия.";
const TW_TITLE = isEn
  ? "Veloseller — inventory management for Shopify sellers"
  : "Veloseller — управление остатками для Wildberries и Ozon";
const TW_DESCRIPTION = isEn
  ? "TVelo, days of cover, safety stock, out-of-stock forecast for ecommerce sellers."
  : "TVelo, дни покрытия, safety stock, прогноз out-of-stock для селлеров маркетплейсов.";
const KEYWORDS = isEn
  ? [
      "shopify inventory management",
      "sales velocity",
      "out-of-stock protection",
      "tvelo",
      "safety stock",
      "reorder point",
      "days of cover",
      "stockout forecast",
      "ecommerce inventory analytics",
    ]
  : [
      "управление остатками wildberries",
      "управление складом ozon",
      "оборачиваемость маркетплейс",
      "out-of-stock защита",
      "tvelo",
      "safety stock",
      "минимальный остаток",
      "прогноз продаж wb",
      "аналитика для селлеров",
      "ozon fbo лимиты",
      "индекс популярности wildberries",
    ];

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE_DEFAULT,
    template: "%s — Veloseller",
  },
  description: DESCRIPTION,
  keywords: KEYWORDS,
  applicationName: "Veloseller",
  authors: [{ name: "Veloseller" }],
  creator: "Veloseller",
  publisher: "Veloseller",
  category: "business",
  alternates: { canonical: "/" },
  // Иконки: favicon мульти-формат, apple-touch-icon, PWA-манифест
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: "/favicon.ico",
  },
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    locale: isEn ? "en_US" : "ru_RU",
    siteName: "Veloseller",
    title: TITLE_DEFAULT,
    description: OG_DESCRIPTION,
    url: SITE_URL,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: TITLE_DEFAULT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TW_TITLE,
    description: TW_DESCRIPTION,
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f7f4e9" }],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={LOCALE} className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
