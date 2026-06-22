/**
 * Admin Supabase клиент (service role, bypass RLS).
 * ИСПОЛЬЗОВАТЬ ТОЛЬКО в /app/admin/* серверных компонентах после проверки ADMIN_EMAILS.
 * Никогда не импортировать в публичные/обычные dashboard страницы.
 */
import { createClient } from "@supabase/supabase-js";

// Типизация результатов — точечно через @/lib/database.types (Tables<>/Enums<>).
// Глобальный <Database> здесь не ставим: ssr@0.5.2 + supabase-js@2.108 ломают
// select-вывод (never). См. database.types.ts.

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Admin client требует NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
