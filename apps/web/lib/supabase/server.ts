import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// @supabase/ssr@0.5.2 собран под старую сигнатуру SupabaseClient (3 generic-арга),
// а supabase-js@2.108 — под новую (4). Из-за этого схема не доходит до postgrest-js
// и select-вывод вырождается в never. Рантайм-объект — настоящий SupabaseClient,
// поэтому тип приводим явно (меняется ТОЛЬКО тип, поведение — нет). Каст убрать
// после апгрейда @supabase/ssr до версии под supabase-js 2.108.

/** Серверный Supabase-клиент: использует cookies для сессии пользователя. */
export async function createSupabaseServerClient(): Promise<SupabaseClient<Database>> {
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
  ) as unknown as SupabaseClient<Database>;
}
