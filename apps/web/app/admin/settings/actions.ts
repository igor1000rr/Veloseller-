"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth";

export async function updateSystemSetting(formData: FormData) {
  // Auth check
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");
  if (!isAdminEmail(user.email)) throw new Error("forbidden");

  const key = String(formData.get("key") || "");
  const rawValue = String(formData.get("value") ?? "");
  const valueType = String(formData.get("type") || "string");

  if (!key) throw new Error("key required");

  let parsedValue: any;
  if (valueType === "boolean") {
    parsedValue = rawValue === "true" || rawValue === "on";
  } else if (valueType === "number") {
    const n = Number(rawValue);
    if (Number.isNaN(n)) throw new Error("invalid number");
    parsedValue = n;
  } else if (valueType === "json") {
    try { parsedValue = JSON.parse(rawValue); } catch { throw new Error("invalid JSON"); }
  } else {
    parsedValue = rawValue;
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("system_settings")
    .update({ value: parsedValue, updated_at: new Date().toISOString(), updated_by: user.id })
    .eq("key", key);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/settings");
}
