import Link from "next/link";

export const metadata = {
  title: "Ошибка авторизации — Veloseller",
};

/**
 * Страница ошибки при email confirmation / OAuth callback.
 *
 * Самые частые причины:
 *  - Ссылка истекла (Supabase живёт 24ч для confirm)
 *  - Ссылка уже использовалась
 *  - PKCE state mismatch (cookies очистились)
 */
export default function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; description?: string }>;
}) {
  return <AuthErrorContent searchParams={searchParams} />;
}

async function AuthErrorContent({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; description?: string }>;
}) {
  const params = await searchParams;
  const error = params.error || "unknown";
  const description = params.description || "Что-то пошло не так.";

  // Человеческие описания частых ошибок
  const friendly: Record<string, string> = {
    "access_denied": "Ссылка устарела или уже использовалась. Попробуй войти или запросить новое письмо.",
    "server_error": "Ошибка сервера Supabase. Попробуй через минуту.",
    "exchange_failed": "Не удалось подтвердить ссылку. Возможно, она устарела.",
  };
  const message = friendly[error] || description;

  return (
    <div className="min-h-screen bg-paper text-ink flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-rose/10 border-2 border-rose flex items-center justify-center">
            <svg className="w-8 h-8 text-rose" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="font-display text-3xl tracking-tight">Не удалось подтвердить</h1>
          <p className="text-ink-muted">{message}</p>
        </div>

        <div className="flex flex-col gap-3">
          <Link
            href="/login"
            className="inline-flex items-center justify-center px-6 py-3 bg-ink text-paper rounded-lg font-mono uppercase tracking-wider text-sm hover:opacity-90"
          >
            Войти
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center justify-center px-6 py-3 border border-line text-ink rounded-lg font-mono uppercase tracking-wider text-sm hover:bg-bg-soft"
          >
            Новая регистрация
          </Link>
        </div>
      </div>
    </div>
  );
}
