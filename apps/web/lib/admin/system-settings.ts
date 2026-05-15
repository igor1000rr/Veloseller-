import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type SettingValue = string | number | boolean | null;
export type SettingRow = {
  key: string;
  value: SettingValue;
  description: string | null;
  category: string;
  updated_at: string;
};

/**
 * Прочитать все настройки (категория → ключ → значение).
 */
export async function loadSystemSettings(): Promise<Record<string, SettingRow[]>> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("system_settings")
    .select("key,value,description,category,updated_at")
    .order("category")
    .order("key");
  const grouped: Record<string, SettingRow[]> = {};
  for (const row of (data ?? []) as any[]) {
    const cat = row.category || "general";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({
      key: row.key,
      value: row.value,
      description: row.description,
      category: cat,
      updated_at: row.updated_at,
    });
  }
  return grouped;
}

export async function getSetting<T = SettingValue>(key: string, fallback: T): Promise<T> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.from("system_settings").select("value").eq("key", key).maybeSingle();
  if (!data) return fallback;
  return (data.value as T) ?? fallback;
}
