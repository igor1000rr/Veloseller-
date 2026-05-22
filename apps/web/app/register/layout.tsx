import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Регистрация",
  description: "Создание аккаунта Veloseller. 30 дней бесплатно, без карты.",
  robots: { index: false, follow: true },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
