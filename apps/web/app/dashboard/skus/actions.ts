"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Деталь ошибки БД — в лог, наружу generic-сообщение: Supabase error.message
 * может содержать имена колонок/constraint'ов. (как jsonError в API-роутах).
 */
function dbError(e: { message?: string } | null): string {
  console.error("[skus action] db error:", e?.message ?? e);
  return "Не удалось выполнить операцию. Попробуйте ещё раз.";
}

/**
 * Безопасно извлечь текст ошибки из unknown (catch теперь типизирован как unknown,
 * а не any). Достаёт message из Error ИЛИ из объекта-ошибки (напр. PostgrestError —
 * это plain object, не instanceof Error), сохраняя прежнюю детализацию.
 */
function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "unknown error";
}

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
      return { ok: false, error: dbError(error) };
    }

    // Освежить страницу SKU — заметка появится в таблице у других открытых табов
    revalidatePath("/dashboard/skus");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e) };
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
      return { ok: false, error: dbError(error) };
    }

    revalidatePath("/dashboard/skus");
    return { ok: true, cleared: data?.length ?? 0 };
  } catch (e) {
    return { ok: false, error: errMessage(e) };
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
      return { ok: false, error: dbError(error) };
    }
    revalidatePath("/dashboard/skus");
    return { ok: true, tags: clean };
  } catch (e) {
    return { ok: false, error: errMessage(e) };
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
      return { ok: false, error: dbError(error) };
    }
    revalidatePath("/dashboard/skus");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e) };
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
      return { ok: false, error: dbError(error) };
    }
    // Дефолт налога читает карточка SKU (юнит-экономика) и форма на cost-import.
    revalidatePath("/dashboard/skus");
    revalidatePath("/dashboard/skus/cost-import");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e) };
  }
}

// =============================================================================
// Календарь событий по SKU и складам (таблица product_events).
//
// product_id = NULL → общее событие склада (привязано к connection_id) и при
// чтении «дублируется» во все товары этого склада. product_id задан → событие
// конкретного товара. Праздники в БД НЕ пишем — они виртуальные (lib/holidays).
// Везде защита: явный eq(seller_id) + RLS product_events_seller_all.
// =============================================================================

const EVENT_TITLE_MAX = 50;
const EVENT_COMMENT_MAX = 100;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type EventCoreFields = {
  title: string;
  startDate: string;
  endDate?: string | null;
  comment?: string | null;
};

type NormalizedEvent =
  | { ok: true; title: string; startDate: string; endDate: string | null; comment: string | null }
  | { ok: false; error: string };

function normalizeEventFields(input: EventCoreFields): NormalizedEvent {
  const title = (input?.title ?? "").trim().slice(0, EVENT_TITLE_MAX);
  if (!title) return { ok: false, error: "Название события обязательно" };
  if (!ISO_DATE_RE.test(input?.startDate ?? "")) return { ok: false, error: "Некорректная дата начала" };
  const endDate = input.endDate && ISO_DATE_RE.test(input.endDate) ? input.endDate : null;
  if (endDate && endDate < input.startDate) return { ok: false, error: "Дата окончания раньше даты начала" };
  const comment = typeof input.comment === "string" && input.comment.trim()
    ? input.comment.slice(0, EVENT_COMMENT_MAX)
    : null;
  return { ok: true, title, startDate: input.startDate, endDate, comment };
}

/**
 * Создать событие. connectionId обязателен. productId опционален: если задан —
 * событие товара (проверяем, что товар принадлежит селлеру и этому складу),
 * если нет — общее событие склада.
 */
export async function createProductEvent(
  input: EventCoreFields & { connectionId: string; productId?: string | null },
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!input?.connectionId || typeof input.connectionId !== "string") {
    return { ok: false, error: "Не указан склад" };
  }
  const norm = normalizeEventFields(input);
  if (!norm.ok) return { ok: false, error: norm.error };
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "unauthorized" };

    const { data: conn } = await supabase
      .from("data_connections")
      .select("id")
      .eq("id", input.connectionId)
      .eq("seller_id", user.id)
      .maybeSingle();
    if (!conn) return { ok: false, error: "Склад не найден" };

    let productId: string | null = null;
    if (input.productId) {
      const { data: prod } = await supabase
        .from("products")
        .select("product_id")
        .eq("product_id", input.productId)
        .eq("seller_id", user.id)
        .eq("connection_id", input.connectionId)
        .maybeSingle();
      if (!prod) return { ok: false, error: "Товар не найден" };
      productId = input.productId;
    }

    const { data, error } = await supabase
      .from("product_events")
      .insert({
        seller_id: user.id,
        connection_id: input.connectionId,
        product_id: productId,
        title: norm.title,
        start_date: norm.startDate,
        end_date: norm.endDate,
        comment: norm.comment,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: dbError(error) };

    revalidatePath("/dashboard/skus");
    revalidatePath("/dashboard");
    return { ok: true, id: (data?.id as string) ?? undefined };
  } catch (e) {
    return { ok: false, error: errMessage(e) };
  }
}

/** Обновить событие (своё — eq(seller_id) + RLS). */
export async function updateProductEvent(
  id: string,
  patch: EventCoreFields,
): Promise<{ ok: boolean; error?: string }> {
  if (!id || typeof id !== "string") return { ok: false, error: "invalid id" };
  const norm = normalizeEventFields(patch);
  if (!norm.ok) return { ok: false, error: norm.error };
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "unauthorized" };
    const { error } = await supabase
      .from("product_events")
      .update({
        title: norm.title,
        start_date: norm.startDate,
        end_date: norm.endDate,
        comment: norm.comment,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("seller_id", user.id);
    if (error) return { ok: false, error: dbError(error) };
    revalidatePath("/dashboard/skus");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e) };
  }
}

/** Удалить событие (своё — eq(seller_id) + RLS). */
export async function deleteProductEvent(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!id || typeof id !== "string") return { ok: false, error: "invalid id" };
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "unauthorized" };
    const { error } = await supabase
      .from("product_events")
      .delete()
      .eq("id", id)
      .eq("seller_id", user.id);
    if (error) return { ok: false, error: dbError(error) };
    revalidatePath("/dashboard/skus");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e) };
  }
}
