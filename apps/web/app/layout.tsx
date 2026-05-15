import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Veloseller — умное управление складскими запасами",
  description:
    "Анализ динамики товарных запасов селлера. Точные метрики скорости продаж с учётом out-of-stock дней.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
