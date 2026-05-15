import type { Metadata } from "next";
import { Geologica, Onest, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Geologica — variable font, weight НЕ передаём (вызывает runtime crash)
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
  title: "Veloseller — скорость продаж без вранья",
  description:
    "TVelo учитывает out-of-stock дни. Реальная скорость продаж, где замораживаешь деньги, на каких SKU теряешь.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
