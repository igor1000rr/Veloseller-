import type { Metadata } from "next";
import { Unbounded, Onest, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const display = Unbounded({
  subsets: ["latin", "cyrillic"],
  variable: "--font-display",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
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
    "TVelo учитывает out-of-stock дни. Видишь реальную скорость продаж, где замораживаешь деньги, на каких SKU теряешь.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
