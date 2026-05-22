import type { Metadata, Viewport } from "next";
import { Geologica, Onest, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { CookieBanner } from "./_components/CookieBanner";

const SITE_URL = "https://veloseller.ru";

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

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Veloseller — управление остатками на Wildberries и Ozon",
    template: "%s — Veloseller",
  },
  description:
    "TVelo учитывает out-of-stock дни. Реальная скорость продаж, прогноз нехватки, расчёт минимального остатка, дни покрытия. Для селлеров Wildberries, Ozon FBO/FBS и Google Sheets.",
  keywords: [
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
  ],
  applicationName: "Veloseller",
  authors: [{ name: "Veloseller" }],
  creator: "Veloseller",
  publisher: "Veloseller",
  category: "business",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "Veloseller",
    title: "Veloseller — управление остатками на Wildberries и Ozon",
    description:
      "TVelo учитывает out-of-stock дни. Реальная скорость продаж, прогноз нехватки, минимальный остаток, дни покрытия.",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "Veloseller — управление остатками для Wildberries и Ozon",
    description:
      "TVelo, дни покрытия, safety stock, прогноз out-of-stock для селлеров маркетплейсов.",
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
    <html lang="ru" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
