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

/**
 * Проверка лимита брендов из тарифа.
 * Возвращает {limit, currentApproved}. Бросает если seller не найден.
 */
async function getRadarLimitInfo(sb: any, userId: string) {
  const { data: seller } = await sb
    .from("sellers")
    .select("radar_brands_limit")
    .eq("id", userId)
    .maybeSingle();
  const limit = seller?.radar_brands_limit ?? 0;

  const { count } = await sb
    .from("radar_brands")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", userId)
    .eq("status", "approved");

  return { limit, currentApproved: count ?? 0 };
}

export async function actionToggleFavorite(queryId: string, value: boolean) {
  const { sb, user } = await getUser();
  const updates: any = {
    is_favorite: value,
    last_updated_at: new Date().toISOString(),
    status: value ? "watching" : "new",
  };
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
  await sb.from("radar_queries")
    .update({
      status: "new",
      last_updated_at: new Date().toISOString(),
    })
    .eq("id", queryId)
    .eq("seller_id", user.id);
  await logAction(sb, user.id, queryId, "query_unarchived");
  revalidatePath("/dashboard/radar");
}

/**
 * Восстановить бренд из excluded в approved.
 *
 * Баг Александра 01.06.2026: из excluded можно было восстановить даже
 * если лимит тарифа исчерпан. Теперь проверяем — если current >= limit,
 * бросаем понятную ошибку. Клиент покажет её через alert().
 */
export async function actionApproveBrand(brandId: string) {
  const { sb, user } = await getUser();

  // Проверяем текущее состояние бренда — если он уже approved, апдейт
  // безопасен (не увеличивает счётчик). Если excluded — проверяем лимит.
  const { data: currentBrand } = await sb
    .from("radar_brands")
    .select("status")
    .eq("id", brandId)
    .eq("seller_id", user.id)
    .maybeSingle();

  if (!currentBrand) {
    throw new Error("Бренд не найден");
  }

  if (currentBrand.status !== "approved") {
    const { limit, currentApproved } = await getRadarLimitInfo(sb, user.id);
    if (currentApproved >= limit) {
      throw new Error(
        `Лимит тарифа: ${limit} брендов. Исключите другой бренд или перейдите на старший тариф.`,
      );
    }
  }

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

  const { limit, currentApproved } = await getRadarLimitInfo(sb, user.id);
  if (currentApproved >= limit) {
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

/**
 * Массовое подтверждение брендов из ревью прайса.
 */
export async function actionBulkUpdateBrands(
  approvedIds: string[],
  excludedIds: string[],
) {
  const { sb, user } = await getUser();

  const { data: seller } = await sb
    .from("sellers")
    .select("radar_brands_limit")
    .eq("id", user.id)
    .maybeSingle();
  const limit = seller?.radar_brands_limit ?? 0;

  const allIds = [...new Set([...approvedIds, ...excludedIds])];
  if (allIds.length === 0) return { changed: 0 };

  const { count: otherApproved } = await sb
    .from("radar_brands")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", user.id)
    .eq("status", "approved")
    .not("id", "in", `(${allIds.join(",")})`);

  const futureApprovedCount = (otherApproved ?? 0) + approvedIds.length;
  if (futureApprovedCount > limit) {
    throw new Error(
      `Лимит тарифа: ${limit} брендов. Выбрано ${futureApprovedCount} — снимите галочки с ${futureApprovedCount - limit} или перейдите на старший тариф.`,
    );
  }

  const updatedAt = new Date().toISOString();
  if (approvedIds.length > 0) {
    await sb.from("radar_brands")
      .update({ status: "approved", updated_at: updatedAt })
      .eq("seller_id", user.id)
      .in("id", approvedIds);
  }
  if (excludedIds.length > 0) {
    await sb.from("radar_brands")
      .update({ status: "excluded", updated_at: updatedAt })
      .eq("seller_id", user.id)
      .in("id", excludedIds);
  }

  await logAction(sb, user.id, null, "brands_bulk_updated");
  revalidatePath("/dashboard/radar");
  revalidatePath("/dashboard/radar/brands");

  return { changed: approvedIds.length + excludedIds.length };
}
