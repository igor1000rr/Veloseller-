import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// @supabase/ssr@0.5.2 собран под старую сигнатуру SupabaseClient (3 generic-арга),
// а supabase-js@2.108 — под новую (4). Из-за этого схема не доходит до postgrest-js
// и select-вывод вырождается в never. Рантайм-объект — настоящий SupabaseClient,
// поэтому тип приводим явно (меняется ТОЛЬКО тип, поведение — нет). Каст убрать
// после апгрейда @supabase/ssr до версии под supabase-js 2.108.

/** Браузерный Supabase-клиент: для Client Components. */
export function createSupabaseBrowserClient(): SupabaseClient<Database> {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ) as unknown as SupabaseClient<Database>;
}
