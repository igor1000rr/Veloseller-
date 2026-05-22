"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server action для сохранения user_notes по SKU.
 *
 * Безопасность: RLS на products гарантирует что юзер может апдейтить только
 * свои строки. Дополнительно проверяем seller_id перед update — defense in depth.
 *
 * Возвращает { ok: true } или { ok: false, error } для отображения в UI.
 */
export async function saveUserNotes(productId: string, notes: string): Promise<{ ok: boolean; error?: string }> {
  if (!productId || typeof productId !== "string") {
    return { ok: false, error: "invalid product id" };
  }
  if (typeof notes !== "string") {
    return { ok: false, error: "invalid notes" };
  }
  // Лимит на длину — защита от хранения мегабайтов в одном поле
  const trimmed = notes.length > 2000 ? notes.slice(0, 2000) : notes;
  const finalNotes = trimmed.trim() === "" ? null : trimmed;

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: "unauthorized" };
    }

    const { error } = await supabase
      .from("products")
      .update({ user_notes: finalNotes })
      .eq("product_id", productId)
      .eq("seller_id", user.id);

    if (error) {
      return { ok: false, error: error.message };
    }

    // Освежить страницу SKU — заметка появится в таблице у других открытых табов
    revalidatePath("/dashboard/skus");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "unknown error" };
  }
}
