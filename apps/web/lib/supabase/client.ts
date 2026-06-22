import { createBrowserClient } from "@supabase/ssr";

// Типизация результатов — точечно через @/lib/database.types (Tables<>/Enums<>).
// Глобальный <Database> здесь не ставим: типы собраны вручную (CLI недоступен) и
// не содержат Relationships/Views, поэтому postgrest-js@2.108 даёт ложные ошибки
// на встроенных select'ах. Подробности и условия включения — в database.types.ts.

/** Браузерный Supabase-клиент: для Client Components. */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
