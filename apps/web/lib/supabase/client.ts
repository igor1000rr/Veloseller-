import { createBrowserClient } from "@supabase/ssr";

// Типы БД доступны в @/lib/database.types (Tables<>/Enums<>) для ТОЧЕЧНОЙ
// типизации результатов. Глобальный generic <Database> здесь НЕ ставим: текущая
// связка @supabase/ssr@0.5.2 + supabase-js@2.108 даёт never в select-выводе
// (drift версий). Включить после согласования ssr↔supabase-js. См. database.types.ts.

/** Браузерный Supabase-клиент: для Client Components. */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
