import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

// Типизация результатов — точечно через @/lib/database.types (Tables<>/Enums<>).
// Глобальный <Database> здесь не ставим: ssr@0.5.2 + supabase-js@2.108 ломают
// select-вывод (never). См. database.types.ts.

/** Серверный Supabase-клиент: использует cookies для сессии пользователя. */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Вызвано из RSC — Server Action / Route Handler сами всё установят
          }
        },
      },
    },
  );
}
