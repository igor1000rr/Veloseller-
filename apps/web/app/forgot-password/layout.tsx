import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Восстановление доступа",
  description: "Сброс пароля для аккаунта Veloseller.",
  robots: { index: false, follow: true },
};

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
