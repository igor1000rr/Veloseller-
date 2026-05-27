"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Server Actions для UI Radar. Все требуют авторизованного юзера —
// RLS политика radar_queries_seller_all автоматически отфильтровывает
// чужие записи. Тут только обновляем + лог в radar_actions.

async function getUser() {
  const sb = await createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("unauthorized");
  return { sb, user };
}

async function logAction(
  sb: any,
  sellerId: string,
  queryId: string | null,
  type: string,
) {
  try {
    await sb.from("radar_actions").insert({
      seller_id: sellerId,
      query_id: queryId,
      action_type: type,
    });
  } catch {
    // не блокируем основное действие если лог не записался
  }
}

export async function actionToggleFavorite(queryId: string, value: boolean) {
  const { sb, user } = await getUser();
  // status=watching при добавлении в избранное (если не archived), early остаётся early.
  // При снятии из избранного — возвращается в свой natural status (early/new).
  const updates: any = { is_favorite: value, last_updated_at: new Date().toISOString() };
  if (value) {
    // Добавили в избранное → status=watching (вкладка "Наблюдение")
    updates.status = "watching";
  } else {
    // Сняли из избранного → возврат в статус в зависимости от текущих present_in_*.
    // Worker всё равно обновит на следующем проходе, но сразу синхронизируем.
    const { data: row } = await sb
      .from("radar_queries")
      .select("present_in_wb, present_in_ozon")
      .eq("id", queryId)
      .eq("seller_id", user.id)
      .maybeSingle();
    updates.status = (row?.present_in_wb || row?.present_in_ozon) ? "new" : "early";
  }
  await sb.from("radar_queries")
    .update(updates)
    .eq("id", queryId)
    .eq("seller_id", user.id);

  await logAction(sb, user.id, queryId, value ? "query_favorited" : "query_unfavorited");
  revalidatePath("/dashboard/radar");
}

export async function actionArchiveQuery(queryId: string) {
  const { sb, user } = await getUser();
  await sb.from("radar_queries")
    .update({
      status: "archived",
      is_favorite: false,
      last_updated_at: new Date().toISOString(),
    })
    .eq("id", queryId)
    .eq("seller_id", user.id);
  await logAction(sb, user.id, queryId, "query_archived");
  revalidatePath("/dashboard/radar");
}

export async function actionUnarchiveQuery(queryId: string) {
  const { sb, user } = await getUser();
  // Возврат в early — worker пересчитает на следующем проходе.
  await sb.from("radar_queries")
    .update({
      status: "early",
      last_updated_at: new Date().toISOString(),
    })
    .eq("id", queryId)
    .eq("seller_id", user.id);
  await logAction(sb, user.id, queryId, "query_unarchived");
  revalidatePath("/dashboard/radar");
}

export async function actionApproveBrand(brandId: string) {
  const { sb, user } = await getUser();
  await sb.from("radar_brands")
    .update({ status: "approved", updated_at: new Date().toISOString() })
    .eq("id", brandId)
    .eq("seller_id", user.id);
  await logAction(sb, user.id, null, "brand_approved");
  revalidatePath("/dashboard/radar");
  revalidatePath("/dashboard/radar/brands");
}

export async function actionExcludeBrand(brandId: string) {
  const { sb, user } = await getUser();
  await sb.from("radar_brands")
    .update({ status: "excluded", updated_at: new Date().toISOString() })
    .eq("id", brandId)
    .eq("seller_id", user.id);
  await logAction(sb, user.id, null, "brand_excluded");
  revalidatePath("/dashboard/radar");
  revalidatePath("/dashboard/radar/brands");
}

export async function actionAddBrandManual(name: string) {
  const { sb, user } = await getUser();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("empty");
  const normalized = trimmed.toLowerCase().replace(/\s+/g, " ");
  // Лимит брендов из тарифа.
  const { data: seller } = await sb
    .from("sellers")
    .select("radar_brands_limit")
    .eq("id", user.id)
    .maybeSingle();
  const { count } = await sb
    .from("radar_brands")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", user.id)
    .eq("status", "approved");
  const limit = seller?.radar_brands_limit ?? 0;
  if ((count ?? 0) >= limit) {
    throw new Error(`Превышен лимит брендов (${limit}). Перейдите на старший тариф.`);
  }
  await sb.from("radar_brands").upsert({
    seller_id: user.id,
    name: trimmed,
    name_normalized: normalized,
    source: "manual",
    status: "approved",
  }, { onConflict: "seller_id,name_normalized" });
  await logAction(sb, user.id, null, "brand_added_manual");
  revalidatePath("/dashboard/radar");
  revalidatePath("/dashboard/radar/brands");
}
