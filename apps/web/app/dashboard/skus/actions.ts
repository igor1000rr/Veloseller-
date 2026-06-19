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

/**
 * Стереть ВСЕ заметки селлера (правка 10, #1 — галочка «Стереть заметки»).
 * Вызывается из SkusFilters при «Рассчитать» с включённой галочкой.
 * Чистит только свои строки (seller_id) и только непустые — минимум работы БД.
 * RLS на products — defense in depth поверх явного eq(seller_id).
 */
export async function clearAllUserNotes(): Promise<{ ok: boolean; cleared?: number; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: "unauthorized" };
    }

    const { data, error } = await supabase
      .from("products")
      .update({ user_notes: null })
      .eq("seller_id", user.id)
      .not("user_notes", "is", null)
      .select("product_id");

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/dashboard/skus");
    return { ok: true, cleared: data?.length ?? 0 };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "unknown error" };
  }
}

/**
 * Сохранить произвольные теги по SKU (правка 10, #6).
 * Теги — свободные строки (бренд/категория/поставщик/что угодно, юзер сам).
 * Нормализация: trim, без пустых, дедуп без учёта регистра, лимит 20 × 40 символов.
 * Пишем только свои строки (seller_id) + RLS на products — defense in depth.
 */
export async function saveProductTags(
  productId: string,
  tags: string[],
): Promise<{ ok: boolean; tags?: string[]; error?: string }> {
  if (!productId || typeof productId !== "string") {
    return { ok: false, error: "invalid product id" };
  }
  if (!Array.isArray(tags)) {
    return { ok: false, error: "invalid tags" };
  }
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const tag = raw.trim().slice(0, 40);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push(tag);
    if (clean.length >= 20) break;
  }
  // Пустой список → null (чтобы строка не висела с {}).
  const finalTags = clean.length ? clean : null;

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: "unauthorized" };
    }
    const { error } = await supabase
      .from("products")
      .update({ tags: finalTags })
      .eq("product_id", productId)
      .eq("seller_id", user.id);
    if (error) {
      return { ok: false, error: error.message };
    }
    revalidatePath("/dashboard/skus");
    return { ok: true, tags: clean };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "unknown error" };
  }
}

/**
 * Сохранить себестоимость по SKU (ручной ввод из карточки, блок Юнит-экономика).
 * Массовый импорт пишет то же поле products.cost_price через воркер — здесь
 * ручная правка одного товара. Пустое/невалидное значение очищает себестоимость.
 * Пишем только свои строки (seller_id) + RLS на products — defense in depth.
 */
export async function saveCostPrice(
  productId: string,
  cost: number | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!productId || typeof productId !== "string") {
    return { ok: false, error: "invalid product id" };
  }
  let finalCost: number | null = null;
  if (cost != null) {
    if (typeof cost !== "number" || !isFinite(cost) || cost < 0) {
      return { ok: false, error: "invalid cost" };
    }
    finalCost = cost;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: "unauthorized" };
    }
    const { error } = await supabase
      .from("products")
      .update({ cost_price: finalCost, cost_price_updated_at: new Date().toISOString() })
      .eq("product_id", productId)
      .eq("seller_id", user.id);
    if (error) {
      return { ok: false, error: error.message };
    }
    revalidatePath("/dashboard/skus");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "unknown error" };
  }
}

/**
 * Сохранить ставку налога на уровне кабинета (sellers.tax_rate). Один процент на
 * весь кабинет (налоговый режим продавца: УСН/ОСН и т.п.). Применяется ко всем
 * товарам кабинета — становится дефолтом в блоке Юнит-экономика. Пустое значение
 * очищает ставку. Пишем только свою строку (id = user.id); RLS sellers_self_update
 * — defense in depth. Диапазон 0..100.
 */
export async function saveSellerTaxRate(rate: number | null): Promise<{ ok: boolean; error?: string }> {
  let finalRate: number | null = null;
  if (rate != null) {
    if (typeof rate !== "number" || !isFinite(rate) || rate < 0 || rate > 100) {
      return { ok: false, error: "invalid tax rate" };
    }
    finalRate = rate;
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: "unauthorized" };
    }
    const { error } = await supabase
      .from("sellers")
      .update({ tax_rate: finalRate })
      .eq("id", user.id);
    if (error) {
      return { ok: false, error: error.message };
    }
    // Дефолт налога читает карточка SKU (юнит-экономика).
    revalidatePath("/dashboard/skus");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "unknown error" };
  }
}
