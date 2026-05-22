import type { Metadata } from "next";

// Auth-страницы не должны индексироваться Google.
// noindex в выдаче для брендовых запросов приведёт к лендингу, а не к форме логина.
export const metadata: Metadata = {
  title: "Войти",
  description: "Вход в аккаунт Veloseller.",
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
