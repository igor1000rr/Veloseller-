import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Service-role клиент — ОБХОДИТ RLS.
 *
 * Использовать ТОЛЬКО для серверных агрегатов вне request-scope (например,
 * внутри unstable_cache, где cookies() недоступны) и ВСЕГДА с явной
 * фильтрацией по seller_id — иначе утечка данных между селлерами.
 * НИКОГДА не отдавать этот клиент в браузер и не использовать для данных,
 * скоуп которых зависит от текущего пользователя.
 */
export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
